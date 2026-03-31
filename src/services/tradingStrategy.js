/**
 * @file tradingStrategy.js
 * @description Core service for technical analysis and signal generation.
 * Calculates SMA (Simple Moving Average) and RSI (Relative Strength Index) using real-time DEX data.
 * Optimized for GeckoTerminal API with built-in retry logic and sampling.
 * @module services/tradingStrategy
 */

const axios = require('axios');
const config = require('../config');

/**
 * Calculates the Simple Moving Average (SMA) for a given set of candles.
 * @param {Array<Object>} candles - Array of candle objects with a 'close' property.
 * @param {number} period - The number of periods to calculate the average.
 * @returns {number|null} The calculated SMA or null if insufficient data.
 */
function calculateMA(candles, period) {
    if (!candles || candles.length < period) return null;
    const subset = candles.slice(-period);
    const sum = subset.reduce((acc, c) => acc + c.close, 0);
    return sum / period;
}

/**
 * Calculates the Relative Strength Index (RSI) using the Wilder's Smoothing Method.
 * @param {Array<Object>} candles - Array of candle objects with a 'close' property.
 * @param {number} period - The RSI period (usually 14).
 * @returns {number|null} The RSI value (0-100) or null if insufficient data.
 */
function calculateRSI(candles, period) {
    if (!candles || candles.length <= period) return null;
    
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < candles.length; i++) {
        const diff = candles[i].close - candles[i - 1].close;
        let currentGain = diff >= 0 ? diff : 0;
        let currentLoss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Robust fetch wrapper with exponential backoff and jitter for handling rate limits.
 * @param {string} url - The GeckoTerminal API endpoint.
 * @param {number} [retries=5] - Number of retry attempts.
 * @param {number} [backoff=2000] - Base delay in ms for backoff.
 * @returns {Promise<Object>} Axios response object.
 * @throws {Error} If all retries fail or a critical status is returned.
 */
async function fetchWithRetry(url, retries = 5, backoff = 2000) {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    try {
        return await axios.get(url, { headers: { 'Accept': 'application/json;version=20230203' } });
    } catch (error) {
        if (retries > 0 && error.response && (error.response.status === 429 || error.response.status >= 500)) {
            const wait = (backoff * (6 - retries)) + (Math.random() * 1000);
            console.log(`[Strategy] API Issue (${error.response.status}). Retrying in ${Math.round(wait)}ms...`);
            await new Promise(resolve => setTimeout(resolve, wait));
            return fetchWithRetry(url, retries - 1, backoff);
        }
        throw error;
    }
}

/**
 * Fetches OHLCV data from GeckoTerminal and handles interval aggregation/sampling.
 * @param {string} symbol - Token pair symbol (e.g., 'BCOINUSDT').
 * @param {string} interval - Desired timeframe (15, 30, 1h, 4h).
 * @param {number} [limit=100] - Number of candles to retrieve.
 * @returns {Promise<Array<Object>>} Normalized candle array [{close, time}].
 */
async function fetchCandles(symbol, interval, limit = 100) {
    const poolMap = {
        'BCOINUSDT': { network: 'bsc', addr: '0x2eebe0c34da9ba65521e98cbaa7d97496d05f489' },
        'SENUSDT': { network: 'polygon', addr: '0xd6c2de543dd1570315cc0bebcdaea522553b7e2b' }
    };
    const target = poolMap[symbol] || poolMap['BCOINUSDT'];
    const networkMap = { 'polygon': 'polygon_pos', 'bsc': 'bsc' };
    const geckoNetwork = networkMap[target.network] || target.network;

    let timeframe = 'minute';
    let aggregate = 1;
    let fetchLimit = limit;

    if (interval === '15') {
        timeframe = 'minute';
        aggregate = 15;
    } else if (interval === '30') {
        timeframe = 'minute';
        aggregate = 15;
        fetchLimit = limit * 2;
    } else if (interval === '4' || interval === '4h') {
        timeframe = 'hour';
        aggregate = 4;
    } else if (interval === '1' || interval === '1h') {
        timeframe = 'hour';
        aggregate = 1;
    }

    const url = `https://api.geckoterminal.com/api/v2/networks/${geckoNetwork}/pools/${target.addr}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${fetchLimit}`;
    const response = await fetchWithRetry(url);
    const ohlcv = response.data.data.attributes.ohlcv_list;

    if (interval === '30') {
        const sampled = [];
        for (let i = 0; i < ohlcv.length; i += 2) sampled.push(ohlcv[i]);
        return sampled.reverse().map(d => ({ close: parseFloat(d[4]), time: d[0] }));
    }

    return ohlcv.reverse().map(d => ({ close: parseFloat(d[4]), time: d[0] }));
}

/**
 * Analyzes market data and returns a BUY, SELL, or HOLD signal.
 * Logic: Crosses below/above MA with RSI confirmation if enabled.
 * @param {string} tokenPair - The pair to analyze (e.g., 'BCOIN/USDT').
 * @param {Object} tradeConfig - User's trade configuration from database.
 * @returns {Promise<Object>} Signal result {signal, reason, price, strategyUsed}.
 */
async function getSignal(tokenPair, tradeConfig) {
  try {
    const symbol = tokenPair.replace('/', '');
    const sA = config.strategy.strategyA;
    const sB = config.strategy.strategyB;

    const [candlesA, candlesB] = await Promise.all([
      fetchCandles(symbol, sA.timeframe.toString()),
      fetchCandles(symbol, sB.timeframe.toString())
    ]);

    const maA = calculateMA(candlesA, sA.maPeriod);
    const maB = calculateMA(candlesB, sB.maPeriod);
    const rsiValue = tradeConfig?.rsiEnabled ? calculateRSI(candlesA, tradeConfig.rsiPeriod || 14) : null;

    const lastPrice = candlesA[candlesA.length - 1].close;
    const prevPrice = candlesA[candlesA.length - 2].close;

    console.log(`[Strategy] ${tokenPair} | 💰 Preço: ${lastPrice.toFixed(6)} | 📉 MA(30m): ${maA?.toFixed(6)} | 📈 MA(4h): ${maB?.toFixed(6)} | 📊 RSI: ${rsiValue ? rsiValue.toFixed(2) : 'OFF'}`);

    let signal = 'HOLD';
    let reason = 'Sem gatilho no momento.';
    let strategyUsed = null;

    const trendUp = lastPrice > maB;

    if (prevPrice >= maA && lastPrice < maA) {
      const rsiConfirm = !tradeConfig?.rsiEnabled || rsiValue < 30;
      if (tradeConfig?.strategy30m && (!tradeConfig?.strategy4h || trendUp) && rsiConfirm) {
        signal = 'BUY';
        reason = `Cruzou ABAIXO da MA${sA.maPeriod} (Fundo). Tendência de Alta em 4h Confirmada.`;
        strategyUsed = 'A';
      }
    } else if (prevPrice <= maA && lastPrice > maA) {
      const rsiConfirm = !tradeConfig?.rsiEnabled || rsiValue > 70;
      if (tradeConfig?.strategy30m && rsiConfirm) {
        signal = 'SELL';
        reason = `Cruzou ACIMA da MA${sA.maPeriod} (Topo). Realizando Lucro.`;
        strategyUsed = 'A';
      }
    }

    return { signal, reason, price: lastPrice, strategyUsed };
  } catch (error) {
    console.error(`[Strategy] Error calculating signal for ${tokenPair}:`, error.message);
    return { signal: 'HOLD', reason: 'Erro técnico no cálculo.' };
  }
}

module.exports = {
  getSignal
};
