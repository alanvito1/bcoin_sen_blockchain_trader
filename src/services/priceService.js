const prisma = require('../config/prisma');
const logger = require('../utils/logger');

/**
 * Enterprise Oracle Service
 * REFACTORED: Now reads EXCLUSIVELY from Local Oracle (Prisma)
 * External fetching is handled solely by the PriceFetcher background job.
 */

/**
 * Fetches the current USD price of a token from the Local Oracle (DB)
 * @param {string} network - 'BSC' or 'POLYGON'
 * @param {string} symbol - 'BCOIN' or 'SEN'
 */
async function getTokenPrice(network, symbol) {
  const now = Date.now();

  // 1. Return USDT if requested
  if (symbol.toUpperCase() === 'USDT') return 1.0;

  // 2. Local Oracle Check (Required for Enterprise Pattern)
  try {
    const latestTick = await prisma.priceTick.findFirst({
      where: {
        symbol: symbol.toUpperCase() + '/USDT',
        network: network.toUpperCase()
      },
      orderBy: { timestamp: 'desc' }
    });

    if (latestTick) {
      const ageMs = now - new Date(latestTick.timestamp).getTime();
      const ageMin = (ageMs / 60000).toFixed(1);

      // Rule: Stale Data Check (MetaMask Resilience)
      if (ageMs > 300000) { // 5 minutes
        logger.warn(`[PriceService] ⚠️ ORACLE STALE: ${symbol} last update was ${ageMin}m ago. Blocked trade calculation.`);
        throw new Error(`Oráculo Obsoleto: Dados de ${symbol} com ${ageMin}m de atraso.`);
      }

      return latestTick.price;
    }
  } catch (dbErr) {
    if (dbErr.message.includes('Oráculo Obsoleto')) throw dbErr;
    logger.error(`[PriceService] 🚨 Local Oracle Query Failed: ${dbErr.message}`);
  }

  throw new Error(`Oráculo Indisponível: Nenhuma cotação de ${symbol} encontrada no Banco de Dados.`);
}

module.exports = {
  getTokenPrice
};
