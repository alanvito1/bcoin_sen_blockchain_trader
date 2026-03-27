const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Helper function for fetching with retry and exponential backoff.
 */
async function fetchWithRetry(url, options = {}, retries = 5, backoff = 2000) {
  // Proactive safety: add a small jittered base delay to avoid hitting the same millisecond as other requests
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500));

  try {
    return await axios.get(url, options);
  } catch (error) {
    if (retries > 0 && error.response && (error.response.status === 429 || error.response.status >= 500)) {
      // Exponential backoff with jitter
      const jitter = Math.random() * 1000;
      const wait = (backoff * (6 - retries)) + jitter; 
      logger.warn(`[Indicator] API Issue (${error.response.status}). Retrying in ${Math.round(wait)}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, wait));
      return fetchWithRetry(url, options, retries - 1, backoff);
    }
    throw error;
  }
}

/**
 * Fetches historical OHLCV data from GeckoTerminal and calculates the Moving Average.
 * @param {string} network - 'bsc' or 'polygon'
 * @param {string} poolId - The GeckoTerminal pool ID (address)
 * @param {string} timeframe - '15' (minutes), 'hour', 'day', '4' (hours)
 * @param {number} period - Numerical period for MA (e.g., 7, 21)
 * @returns {Promise<{ma: number, currentPrice: number, trend: 'bullish' | 'bearish'}>}
 */
async function getMATrend(network, poolId, timeframe = '15', period = 7) {
  try {
    const poolAddress = (poolId.includes('_') ? poolId.split('_')[1] : poolId).toLowerCase();
    
    // Mapping for GeckoTerminal network IDs
    const networkMap = {
      'polygon': 'polygon_pos',
      'bsc': 'bsc'
    };
    const geckoNetwork = networkMap[network] || network;

    // GeckoTerminal Timeframe Mapping
    let geckoTimeframe = 'minute';
    let aggregate = 1;
    let fetchLimit = period + 5;

    const tf = timeframe.toString();

    if (tf === '15') {
      geckoTimeframe = 'minute';
      aggregate = 15;
    } else if (tf === '30') {
      geckoTimeframe = 'minute';
      aggregate = 15;
      fetchLimit = (period * 2) + 5; // Double the points to simulate 30m
    } else if (tf === '4') {
      geckoTimeframe = 'hour';
      aggregate = 4;
    } else if (tf === 'hour' || tf === '1') {
      geckoTimeframe = 'hour';
      aggregate = 1;
    }

    const url = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${poolAddress}/ohlcv/${geckoTimeframe}?aggregate=${aggregate}&limit=${fetchLimit}`;
    
    const response = await fetchWithRetry(url, {
      headers: { 'Accept': 'application/json;version=20230203' }
    });

    const ohlcvList = response.data.data.attributes.ohlcv_list;
    if (!ohlcvList || ohlcvList.length < (tf === '30' ? period * 2 : period)) {
      throw new Error(`Insufficient data for MA${period} calculation on ${geckoTimeframe}. Got ${ohlcvList?.length || 0} points.`);
    }

    const currentPrice = ohlcvList[0][4]; // Latest Close

    let sum = 0;
    if (tf === '30') {
      // For 30m using 15m candles: take candles at index 0, 2, 4...
      for (let i = 0; i < period; i++) {
        sum += ohlcvList[i * 2][4];
      }
    } else {
      // Normal SMA
      for (let i = 0; i < period; i++) {
        sum += ohlcvList[i][4];
      }
    }
    const ma = sum / period;

    const trend = currentPrice > ma ? 'bullish' : 'bearish';

    return {
      ma,
      currentPrice,
      trend
    };
  } catch (error) {
    logger.error(`Error fetching ${timeframe} MA${period} for ${poolId}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getMATrend
};
