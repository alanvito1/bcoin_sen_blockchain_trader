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
async function fetchCandles(symbol, interval, limit = 100) {
    const tokenPair = symbol.includes('/') ? symbol : (symbol === 'BCOINUSDT' ? 'BCOIN/USDT' : (symbol === 'SENUSDT' ? 'SEN/USDT' : symbol));
    const network = symbol.includes('SEN') ? 'POLYGON' : 'BSC'; 
    const tf = TIMEFRAME_MAP[interval] || TIMEFRAME_MAP['30m'];

    try {
        const minutesNeeded = tf.geckoTf === 'hour' ? tf.aggregate * 60 : tf.aggregate;
        const totalTicksNeeded = minutesNeeded * limit;
        
        const ticks = await prisma.priceTick.findMany({
            where: { symbol: tokenPair, network },
            orderBy: { timestamp: 'desc' },
            take: totalTicksNeeded
        });

        if (ticks.length >= totalTicksNeeded) {
            const candles = [];
            for (let i = 0; i < ticks.length; i += minutesNeeded) {
                const group = ticks.slice(i, i + minutesNeeded);
                if (group.length > 0) {
                    candles.push({
                        close: group[0].price, 
                        time: group[0].timestamp.getTime() / 1000
                    });
                }
            }

            const latestTick = ticks[0].timestamp;
            const threshold = Math.max(1000 * 60 * 10, 1000 * 60 * minutesNeeded * 2);
            
                if ((Date.now() - latestTick.getTime()) < threshold) {
                    logger.info(`[Strategy] ${symbol} | Using Cache (${candles.length} candles from ${ticks.length} ticks)`);
                    return candles.reverse().slice(-limit);
                }
        }
        
        logger.warn(`[Strategy] ${symbol} | DB Data stale or insufficient (${ticks.length}/${totalTicksNeeded} ticks). HOLD advised.`);
    } catch (dbErr) {
        logger.error(`[Strategy] CRITICAL: DB Error fetching ticks: ${dbErr.message}`);
    }

    return []; // Return empty if no data, logic will HOLD.
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

    // Use User Config if available, fallback to Global Config
    const tfA = tradeConfig?.timeframeA || sA.timeframe.toString();
    const tfB = tradeConfig?.timeframeB || sB.timeframe.toString();
    const maPeriodA = tradeConfig?.maPeriodA || sA.maPeriod;
    const maPeriodB = tradeConfig?.maPeriodB || sB.maPeriod;

    const [candlesA, candlesB] = await Promise.all([
      fetchCandles(symbol, tfA),
      fetchCandles(symbol, tfB)
    ]);

    const maA = calculateMA(candlesA, maPeriodA);
    const maB = calculateMA(candlesB, maPeriodB);
    const rsiValue = tradeConfig?.rsiEnabled ? calculateRSI(candlesA, tradeConfig.rsiPeriod || 14) : null;

    if (!candlesA || candlesA.length < 2) {
      return { signal: 'HOLD', reason: 'Dados insuficientes no banco local. Aguardando sincronização de preços.' };
    }

    const lastPrice = candlesA[candlesA.length - 1].close;
    const prevPrice = candlesA[candlesA.length - 2].close;

    logger.info(`[Strategy] ${tokenPair} | 💰 Preço: ${lastPrice.toFixed(6)} | 📉 MA(${tfA}): ${maA?.toFixed(6)} | 📈 MA(${tfB}): ${maB?.toFixed(6)} | 📊 RSI: ${rsiValue ? rsiValue.toFixed(2) : 'DISABLED (Bypassing filter)'}`);

    let signal = 'HOLD';
    let reason = 'Análise técnica concluída: Sem sinal claro de compra/venda.';
    let strategyUsed = null;

    const trendUp = lastPrice > maB;

    if (prevPrice >= maA && lastPrice < maA) {
      const rsiConfirm = !tradeConfig?.rsiEnabled || rsiValue < 30;
      if (tradeConfig?.strategy30m && (!tradeConfig?.strategy4h || trendUp) && rsiConfirm) {
        signal = 'BUY';
        reason = `Cruzou ABAIXO da MA${maPeriodA} (Fundo). Tendência de Alta em ${tfB} Confirmada.`;
        strategyUsed = 'A';
      }
    } else if (prevPrice <= maA && lastPrice > maA) {
      const rsiConfirm = !tradeConfig?.rsiEnabled || rsiValue > 70;
      if (tradeConfig?.strategy30m && rsiConfirm) {
        signal = 'SELL';
        reason = `Cruzou ACIMA da MA${maPeriodA} (Topo). Realizando Lucro.`;
        strategyUsed = 'A';
      }
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
