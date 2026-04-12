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

  // 3. WATERFALL ORACLE: STEP 1 - DexScreener (Reliable UI API)
  const netKey = network.toLowerCase();
  const tokenInfo = config.networks[netKey]?.tokens.find(t => t.symbol === symbol.toUpperCase());
  if (!tokenInfo) throw new Error(`Token ${symbol} not found on ${network}.`);
  const tokenAddress = tokenInfo.address.toLowerCase();

  try {
    const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const dexData = await axios.get(dexUrl, { timeout: 5000 }).then(r => r.data);
    
    const pair = dexData.pairs?.[0];
    if (pair && pair.priceUsd) {
      const price = parseFloat(pair.priceUsd);
      await savePriceToDb(network, symbol, price);
      return price;
    }
  } catch (e) {
    logger.warn(`[PriceService] DexScreener failed for ${symbol}: ${e.message}`);
  }

  // 4. WATERFALL ORACLE: STEP 2 - GeckoTerminal (Backup API)
  if (tokenInfo.pool) {
    const geckoNetwork = netKey === 'polygon' ? 'polygon_pos' : 'bsc';
    const poolAddress = tokenInfo.pool.toLowerCase();
    const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${poolAddress}`;

    try {
      const gResponse = await axios.get(geckoUrl, { timeout: 5000 }).then(r => r.data);
      const price = parseFloat(gResponse.data.attributes.base_token_price_usd);
      if (price > 0) {
        await savePriceToDb(network, symbol, price);
        return price;
      }
    } catch (e) {
      logger.warn(`[PriceService] GeckoTerminal failed for ${symbol}: ${e.message}`);
    }
  }

  // 5. WATERFALL ORACLE: STEP 3 - On-Chain (The Immutable Truth)
  // Uses router.getAmountsOut to calculate price directly from the pool
  try {
    const { providers } = require('./blockchain');
    const provider = providers[netKey];
    const routerAddress = config.networks[netKey].router;
    const usdtAddress = config.networks[netKey].usdt;
    const wrappedNative = config.networks[netKey].wrappedNative;

    const routerAbi = ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'];
    const routerContract = new ethers.Contract(routerAddress, routerAbi, provider);

    // Path: Token -> WrappedNative -> USDT (Most liquid path for small tokens)
    const path = [tokenAddress, wrappedNative, usdtAddress];
    const amountIn = ethers.parseUnits('1', tokenInfo.decimals || 18);
    
    const amounts = await routerContract.getAmountsOut(amountIn, path);
    const price = parseFloat(ethers.formatUnits(amounts[amounts.length - 1], config.networks[netKey].usdtDecimals || 18));

    if (price > 0) {
      logger.info(`[PriceService] 🔗 On-Chain Oracle used for ${symbol}: $${price}`);
      await savePriceToDb(network, symbol, price);
      return price;
    }
  } catch (e) {
    logger.warn(`[PriceService] On-Chain Oracle failed for ${symbol}: ${e.message}`);
  }

  // 6. STALE FALLBACK: If all else fails, use the latest known price from DB regardless of age
  const veryStaleTick = await prisma.priceTick.findFirst({
    where: { symbol: symbol.toUpperCase() + '/USDT', network: network.toUpperCase() },
    orderBy: { timestamp: 'desc' }
  });
  
  if (veryStaleTick) {
    logger.error(`[PriceService] 🚨 ALL ORACLES FAILED for ${symbol}. Using STALE price from ${veryStaleTick.timestamp}`);
    return veryStaleTick.price;
  }
  
  throw new Error(`Não foi possível obter o preço de ${symbol} em nenhum oráculo (FÍSICO OU API).`);
}

/**
 * Persist price to DB for fast local retrieval
 */
async function savePriceToDb(network, symbol, price) {
  try {
    await prisma.priceTick.create({
      data: {
        symbol: symbol.toUpperCase() + '/USDT',
        network: network.toUpperCase(),
        price,
        timestamp: new Date()
      }
    });
  } catch (e) {
    // Ignore duplicate key or minor DB errors
  }
}

module.exports = {
  getTokenPrice
};
