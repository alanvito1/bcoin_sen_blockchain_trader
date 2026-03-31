/**
 * @file indicator.js
 * @description Technical Indicator Service. 
 * Provides SMA and RSI calculations by fetching OHLCV data from GeckoTerminal.
 * Primarily used by the legacy Scheduler for global market scanning.
 * @module services/indicator
 */
const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Valid timeframe strings accepted across the system.
 * Maps user-facing labels to GeckoTerminal API parameters.
 */
const TIMEFRAME_MAP = {
  '5m':  { geckoTf: 'minute', aggregate: 5  },
  '15m': { geckoTf: 'minute', aggregate: 15 },
  '30m': { geckoTf: 'minute', aggregate: 30 },
  '1h':  { geckoTf: 'hour',   aggregate: 1  },
  '4h':  { geckoTf: 'hour',   aggregate: 4  },
  '1d':  { geckoTf: 'day',    aggregate: 1  },
  '1w':  { geckoTf: 'week',   aggregate: 1  },
  // Legacy aliases (old config values)
  '15':  { geckoTf: 'minute', aggregate: 15 },
  '30':  { geckoTf: 'minute', aggregate: 30 },
  '4':   { geckoTf: 'hour',   aggregate: 4  },
  'hour':{ geckoTf: 'hour',   aggregate: 1  },
  '1':   { geckoTf: 'hour',   aggregate: 1  },
};

/**
 * Robust fetch wrapper with exponential backoff for GeckoTerminal API.
 * @param {string} url - API Endpoint.
 * @param {Object} [options={}] - Axios options.
 * @param {number} [retries=5] - Number of retries.
 * @param {number} [backoff=2000] - Base delay for backoff.
 * @returns {Promise<Object>} Axios response.
 */
async function fetchWithRetry(url, options = {}, retries = 5, backoff = 2000) {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 500));
  try {
    return await axios.get(url, options);
  } catch (error) {
    if (retries > 0 && error.response && (error.response.status === 429 || error.response.status >= 500)) {
      const jitter = Math.random() * 1000;
      const wait = (backoff * (6 - retries)) + jitter;
      logger.warn(`[Indicator] API Issue (${error.response.status}). Retrying in ${Math.round(wait)}ms... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, wait));
      return fetchWithRetry(url, options, retries - 1, backoff);
    }
    throw error;
  }
}

/**
 * Fetches OHLCV candles from GeckoTerminal for a given pool and timeframe.
 * @param {string} network - Network identifier.
 * @param {string} poolId - Pool address.
 * @param {string} timeframe - Target timeframe (e.g., '15m').
 * @param {number} limit - Number of candles to fetch.
 * @returns {Promise<Array>} OHLCV data array.
 */
async function fetchOHLCV(network, poolId, timeframe, limit) {
  const tf = TIMEFRAME_MAP[timeframe] || TIMEFRAME_MAP['30m'];
  const poolAddress = (poolId.includes('_') ? poolId.split('_')[1] : poolId).toLowerCase();
  const networkMap = { polygon: 'polygon_pos', bsc: 'bsc' };
  const geckoNetwork = networkMap[network] || network;

  const url = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${poolAddress}/ohlcv/${tf.geckoTf}?aggregate=${tf.aggregate}&limit=${limit}`;

  const response = await fetchWithRetry(url, { headers: { 'Accept': 'application/json;version=20230203' } });
  return response.data.data.attributes.ohlcv_list; // newest first
}

/**
 * Calculates Simple Moving Average from an OHLCV list (newest-first).
 * @param {Array} ohlcvList - OHLCV data, index 0 = newest candle
 * @param {number} period
 */
function calcSMA(ohlcvList, period) {
  let sum = 0;
  for (let i = 0; i < period; i++) sum += ohlcvList[i][4];
  return sum / period;
}

/**
 * Calculates RSI from OHLCV list (newest-first).
 * Returns a value 0–100.
 */
function calcRSI(ohlcvList, period = 14) {
  // RSI needs period+1 closes. ohlcvList is newest-first, so we reverse for chronological order.
  const closes = ohlcvList.map(c => c[4]).reverse(); // oldest first
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * High-level function to calculate MA trend and RSI for a pool.
 * @param {string} network - 'bsc' or 'polygon'.
 * @param {string} poolId - Pool identity/address.
 * @param {string} [timeframe='30m'] - Execution timeframe.
 * @param {number} [maPeriod=21] - Moving Average period.
 * @param {boolean} [rsiEnabled=false] - Whether to calculate RSI.
 * @param {number} [rsiPeriod=14] - RSI period.
 * @returns {Promise<Object>} Object containing ma, currentPrice, trend, rsi, and rsiSignal.
 */
async function getMATrend(network, poolId, timeframe = '30m', maPeriod = 21, rsiEnabled = false, rsiPeriod = 14) {
  try {
    const fetchLimit = Math.max(maPeriod, rsiPeriod) + 20;
    const ohlcvList = await fetchOHLCV(network, poolId, timeframe, fetchLimit);

    if (!ohlcvList || ohlcvList.length < maPeriod) {
      throw new Error(`Insufficient data for MA${maPeriod} on ${timeframe}. Got ${ohlcvList?.length || 0} candles.`);
    }

    const currentPrice = ohlcvList[0][4];
    const ma = calcSMA(ohlcvList, maPeriod);
    const trend = currentPrice > ma ? 'bullish' : 'bearish';

    let rsi = null;
    let rsiSignal = null;
    if (rsiEnabled && ohlcvList.length >= rsiPeriod + 1) {
      rsi = calcRSI(ohlcvList, rsiPeriod);
      if (rsi !== null) {
        rsiSignal = rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral';
      }
    }

    return { ma, currentPrice, trend, rsi, rsiSignal };
  } catch (error) {
    logger.error(`[Indicator] Error for ${timeframe} MA${maPeriod} pool ${poolId}: ${error.message}`);
    throw error;
  }
}

module.exports = { getMATrend, TIMEFRAME_MAP };
