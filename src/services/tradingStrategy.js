/**
 * @file tradingStrategy.js
 * @description Core service for technical analysis and signal generation.
 * Calculates SMA (Simple Moving Average) and RSI (Relative Strength Index) using real-time DEX data.
 * Optimized for GeckoTerminal API with built-in retry logic and sampling.
 * @module services/tradingStrategy
 */

const config = require('../config');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

/**
 * Valid timeframe strings accepted across the system.
 */
const TIMEFRAME_MAP = {
  '5m':  { geckoTf: 'minute', aggregate: 5  },
  '15m': { geckoTf: 'minute', aggregate: 15 },
  '30m': { geckoTf: 'minute', aggregate: 30 },
  '1h':  { geckoTf: 'hour',   aggregate: 1  },
  '4h':  { geckoTf: 'hour',   aggregate: 4  },
  '1d':  { geckoTf: 'day',    aggregate: 1  },
  '1w':  { geckoTf: 'week',   aggregate: 1  },
  '15':  { geckoTf: 'minute', aggregate: 15 },
  '30':  { geckoTf: 'minute', aggregate: 30 },
  '4':   { geckoTf: 'hour',   aggregate: 4  },
  'hour':{ geckoTf: 'hour',   aggregate: 1  },
  '1':   { geckoTf: 'hour',   aggregate: 1  },
};

/**
 * Calculates the Simple Moving Average (SMA) for a given set of candles.
 */
function calculateMA(candles, period) {
    if (!candles || candles.length < period) return null;
    const subset = candles.slice(-period);
    const sum = subset.reduce((acc, c) => acc + c.close, 0);
    return sum / period;
}

/**
 * Calculates the Relative Strength Index (RSI).
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
 * Fetches OHLCV data from local Database (PriceTick).
 * Consumes 0 API credits.
 * @param {string} symbol - Token pair symbol (e.g., 'BCOIN/USDT').
 * @param {string} interval - Desired timeframe (5m, 15m, 30m, 1h, 4h).
 * @param {number} [limit=100] - Number of candles to retrieve.
 * @returns {Promise<Array<Object>>} Normalized candle array [{close, time}].
 */
/**
 * Fetches OHLCV data from local Database (PriceTick).
 * Consumes 0 API credits.
 * @param {string} symbol - Token pair symbol (e.g., 'BCOIN/USDT').
 * @param {string} interval - Desired timeframe (5m, 15m, 30m, 1h, 4h).
 * @param {number} [limit=50] - Number of candles to retrieve.
 * @returns {Promise<Array<Object>>} Normalized candle array [{close, time}].
 */
async function fetchCandles(symbol, interval, limit = 50) {
    const tokenPair = symbol.includes('/') ? symbol : (symbol === 'BCOINUSDT' ? 'BCOIN/USDT' : (symbol === 'SENUSDT' ? 'SEN/USDT' : symbol));
    const network = symbol.includes('SEN') ? 'POLYGON' : 'BSC'; 
    const tf = TIMEFRAME_MAP[interval] || TIMEFRAME_MAP['30m'];

    try {
        const minutesNeeded = tf.geckoTf === 'hour' ? tf.aggregate * 60 : tf.aggregate;
        const totalTicksNeeded = minutesNeeded * limit;
        
        // Graceful Degradation: Fetch as much as possible, up to the limit
        const ticks = await prisma.priceTick.findMany({
            where: { symbol: tokenPair, network },
            orderBy: { timestamp: 'desc' },
            take: totalTicksNeeded
        });

        if (ticks.length > 0) {
            const candles = [];
            // Aggregate ticks into candles based on minutesNeeded
            for (let i = 0; i < ticks.length; i += minutesNeeded) {
                const group = ticks.slice(i, i + minutesNeeded);
                if (group.length > 0) {
                    candles.push({
                        close: group[0].price, 
                        time: group[0].timestamp.getTime() / 1000
                    });
                }
            }

            // Return whatever we built (Partial history is better than HOLD)
            return candles.reverse().slice(-limit);
        }
        
        logger.warn(`[Strategy] ${symbol} | No data found in DB for ${interval}.`);
    } catch (dbErr) {
        logger.error(`[Strategy] CRITICAL: DB Error fetching ticks: ${dbErr.message}`);
    }

    return [];
}

/**
 * Analyzes market data and returns a BUY, SELL, or HOLD signal (Grid Accumulator Mode).
 * Logic: 
 *  - Price < MA = BUY (Immediate Accumulation)
 *  - Price > MA = SELL (Immediate Profit taking)
 *  - RSI acts as a strict VETO if enabled.
 * @param {string} tokenPair - The pair to analyze (e.g., 'BCOIN/USDT').
 * @param {Object} tradeConfig - User's trade configuration from database.
 * @returns {Promise<Object>} Signal result {signal, reason, price, strategyUsed}.
 */
async function getSignal(tokenPair, tradeConfig) {
  try {
    // FORCE SIGNAL OVERRIDE (For Engine Validation)
    if (tradeConfig?.forceSignal) {
      logger.info(`[Strategy] 🎯 FORCE SIGNAL DETECTED: ${tradeConfig.forceSignal} for ${tokenPair}`);
      return { 
        signal: tradeConfig.forceSignal, 
        reason: 'Manual Engine Trigger (QA Force Signal)', 
        price: 0, 
        strategyUsed: 'FORCE' 
      };
    }

    const symbol = tokenPair.replace('/', '');
    const sA = config.strategy.strategyA;
    const sB = config.strategy.strategyB;

    const tfA = tradeConfig?.timeframeA || sA.timeframe.toString();
    const tfB = tradeConfig?.timeframeB || sB.timeframe.toString();
    const maPeriodA = tradeConfig?.maPeriodA || sA.maPeriod;
    const maPeriodB = tradeConfig?.maPeriodB || sB.maPeriod;

    const [candlesA, candlesB] = await Promise.all([
      fetchCandles(symbol, tfA),
      fetchCandles(symbol, tfB)
    ]);

    if (!candlesA || candlesA.length === 0) {
      return { signal: 'HOLD', reason: 'Aguardando população de dados históricos (Oracle Starvation).' };
    }

    const lastPrice = candlesA[candlesA.length - 1].close;
    const maA = calculateMA(candlesA, maPeriodA);
    const maB = calculateMA(candlesB, maPeriodB);
    const rsiValue = tradeConfig?.rsiEnabled ? calculateRSI(candlesA, tradeConfig.rsiPeriod || 14) : null;

    logger.info(`[Strategy] ${tokenPair} | 💰 Preço: ${lastPrice.toFixed(6)} | 📉 MA(${tfA}): ${maA ? maA.toFixed(6) : 'N/A'} | 📈 MA(${tfB}): ${maB ? maB.toFixed(6) : 'N/A'} | 📊 RSI: ${rsiValue ? rsiValue.toFixed(2) : 'OFF'}`);

    let signal = 'HOLD';
    let reason = 'Preço em equilíbrio com a baliza (MA).';
    let strategyUsed = null;

    // Filter B: Higher Trend Up (Optional Veto)
    const trendUp = (maB !== null) ? (lastPrice > maB) : true;

    // Grid Logic Implementation
    if (maA !== null) {
      if (lastPrice < maA) {
        // Condition: Price below Pivot (BUY Opportunity)
        // RSI Veto: If RSI enabled, it MUST be below 40 (Oversold/Cheap enough)
        const rsiConfirm = !tradeConfig?.rsiEnabled || (rsiValue !== null && rsiValue < 40);
        
        if (tradeConfig?.strategy30m && (!tradeConfig?.strategy4h || trendUp)) {
          if (rsiConfirm) {
            signal = 'BUY';
            reason = `Grid Accumulator: Preço (${lastPrice.toFixed(6)}) abaixo da Baliza MA${maPeriodA} (${maA.toFixed(6)}).`;
            strategyUsed = 'A';
          } else {
            reason = `HOLD: Preço < MA (Compra), mas RSI (${rsiValue?.toFixed(2)}) desautoriza a entrada.`;
          }
        }
      } else if (lastPrice > maA) {
        // Condition: Price above Pivot (SELL Opportunity)
        // RSI Veto: If RSI enabled, it MUST be above 60 (Overbought/Expensive enough)
        const rsiConfirm = !tradeConfig?.rsiEnabled || (rsiValue !== null && rsiValue > 60);
        
        if (tradeConfig?.strategy30m) {
          if (rsiConfirm) {
            signal = 'SELL';
            reason = `Grid Distribution: Preço (${lastPrice.toFixed(6)}) acima da Baliza MA${maPeriodA} (${maA.toFixed(6)}).`;
            strategyUsed = 'A';
          } else {
            reason = `HOLD: Preço > MA (Venda), mas RSI (${rsiValue?.toFixed(2)}) desautoriza a saída.`;
          }
        }
      }
    } else {
      reason = 'Aguardando amostras suficientes para calcular a baliza (MA).';
    }

    return { signal, reason, price: lastPrice, strategyUsed };
  } catch (error) {
    logger.error(`[Strategy] Error calculating signal for ${tokenPair}:`, error.message);
    return { signal: 'HOLD', reason: 'Erro técnico no cálculo.' };
  }
}

module.exports = {
  getSignal,
  TIMEFRAME_MAP
};
