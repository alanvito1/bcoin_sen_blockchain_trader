const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

const cache = {
  data: {},
  TTL: 30000 // 30 seconds
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
 * Fetches the current USD price of a token using GeckoTerminal API
 * @param {string} network - 'BSC' or 'POLYGON'
 * @param {string} symbol - 'BCOIN' or 'SEN'
 */
async function getTokenPrice(network, symbol) {
  const cacheKey = `${network}_${symbol}`.toLowerCase();
  const now = Date.now();

  // 1. Return Cache if valid
  if (cache.data[cacheKey] && (now - cache.data[cacheKey].timestamp < cache.TTL)) {
    return cache.data[cacheKey].price;
  }

  // 2. Mock USDT (Pegged)
  if (symbol.toUpperCase() === 'USDT') return 1.0;

  const netConfig = config.networks[network.toLowerCase()];
  if (!netConfig) throw new Error(`Network ${network} not found in config.`);

  const tokenInfo = netConfig.tokens.find(t => t.symbol === symbol);
  if (!tokenInfo || !tokenInfo.pool) {
    throw new Error(`Token ${symbol} or its pool not found on ${network}.`);
  }

  // GeckoTerminal network mapping
  const geckoNetwork = network.toLowerCase() === 'polygon' ? 'polygon_pos' : 'bsc';
  const poolAddress = tokenInfo.pool.toLowerCase();

  const url = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${poolAddress}`;

  try {
    const response = await fetchPrice(url);
    
    const attributes = response.data.attributes;
    const baseTokenRef = response.data.relationships.base_token.data.id;
    
    // Robust address extraction: GeckoTerminal IDs are formatted as "network_address"
    // For Polygon POS it's "polygon_pos_0x...", so we take the last part.
    const baseAddress = baseTokenRef.split('_').pop().toLowerCase();
    const targetAddress = tokenInfo.address.toLowerCase();
    
    const isBaseToken = baseAddress === targetAddress;

    let price;
    if (isBaseToken) {
      price = parseFloat(attributes.base_token_price_usd);
    } else {
      // If our token is the quote token in this pool
      price = parseFloat(attributes.quote_token_price_usd);
    }

    if (!price || isNaN(price)) {
      throw new Error(`Invalid price received for ${symbol}`);
    }

    cache.data[cacheKey] = { price, timestamp: now };
    logger.info(`[PriceService] Updated price for ${symbol} on ${network}: $${price.toFixed(6)}`);
    
    return price;
  } catch (error) {
    if (cache.data[cacheKey]) {
      logger.warn(`[PriceService] API Failed for ${symbol}, using stale cache.`);
      return cache.data[cacheKey].price;
    }
    throw new Error(`Não foi possível obter o preço de ${symbol} no momento.`);
  }
}

module.exports = {
  getTokenPrice
};
