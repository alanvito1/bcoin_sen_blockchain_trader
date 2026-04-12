const axios = require('axios');
const prisma = require('../config/prisma');
const config = require('../config');
const logger = require('../utils/logger');

const cache = {
  data: {},
  TTL: 30000 // 30 seconds local in-memory TTL
};

/**
 * Helper for fetching with minimal retry
 */
async function fetchPrice(url) {
  try {
    const res = await axios.get(url, { headers: { 'Accept': 'application/json' } });
    return res.data;
  } catch (err) {
    logger.error(`[PriceService] Fetch Error: ${err.message}`);
    throw err;
  }
}

/**
 * Fetches the current USD price of a token using Local Oracle (DB) or fallback GeckoTerminal
 * @param {string} network - 'BSC' or 'POLYGON'
 * @param {string} symbol - 'BCOIN' or 'SEN'
 */
async function getTokenPrice(network, symbol) {
  const cacheKey = `${network}_${symbol}`.toLowerCase();
  const now = Date.now();

  // 1. Return USDT if requested
  if (symbol.toUpperCase() === 'USDT') return 1.0;

  // 2. Check Local Oracle (Prisma) first - 60-120s Freshness
  try {
    const latestTick = await prisma.priceTick.findFirst({
      where: {
        symbol: symbol.toUpperCase() + '/USDT',
        network: network.toUpperCase()
      },
      orderBy: { timestamp: 'desc' }
    });

    if (latestTick && (now - new Date(latestTick.timestamp).getTime() < 120000)) {
      // logger.info(`[PriceService] Using Local Oracle for ${symbol} @ $${latestTick.price.toFixed(6)}`);
      return latestTick.price;
    }
  } catch (dbErr) {
    logger.warn(`[PriceService] Local Oracle Query Failed: ${dbErr.message}`);
  }

  // 3. Fallback to API Fetch (GeckoTerminal) if DB is stale or missing
  const netConfig = config.networks[network.toLowerCase()];
  if (!netConfig) throw new Error(`Network ${network} not found in config.`);

  const tokenInfo = netConfig.tokens.find(t => t.symbol === symbol.toUpperCase());
  if (!tokenInfo || !tokenInfo.pool) {
    throw new Error(`Token ${symbol} or its pool not found on ${network}.`);
  }

  // GeckoTerminal network mapping
  const geckoNetwork = network.toLowerCase() === 'polygon' ? 'polygon_pos' : 'bsc';
  const poolAddress = tokenInfo.pool.toLowerCase();

  const url = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${poolAddress}`;

  try {
    logger.info(`[PriceService] 🌐 Fetching live price for ${symbol} (DB stale)...`);
    const response = await fetchPrice(url);
    
    const attributes = response.data.attributes;
    const price = parseFloat(attributes.base_token_price_usd);

    if (!price || isNaN(price)) {
      throw new Error(`Invalid price received for ${symbol}`);
    }

    // Update DB with the fresh price too (Self-Correction)
    await prisma.priceTick.create({
      data: {
        symbol: symbol.toUpperCase() + '/USDT',
        network: network.toUpperCase(),
        price,
        timestamp: new Date()
      }
    }).catch(() => {});

    return price;
  } catch (error) {
    // Last resort: Check if we have ANY stale data in DB
    const veryStaleTick = await prisma.priceTick.findFirst({
      where: { symbol: symbol.toUpperCase() + '/USDT', network: network.toUpperCase() },
      orderBy: { timestamp: 'desc' }
    });
    
    if (veryStaleTick) {
      logger.warn(`[PriceService] API Failed for ${symbol}, using STALE DB price ($${veryStaleTick.price}).`);
      return veryStaleTick.price;
    }
    
    throw new Error(`Não foi possível obter o preço de ${symbol} no momento.`);
  }
}

module.exports = {
  getTokenPrice
};
