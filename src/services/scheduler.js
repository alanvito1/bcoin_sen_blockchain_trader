/**
 * @file scheduler.js
 * @description Discipline Service: Manages randomized trading windows and execution cycles.
 * Ensures trades only happen within specific timeframes (e.g., min 15-29 and 45-59) 
 * to mimic human-like behavior and maintain strategy discipline.
 * @module services/scheduler
 */

const config = require('../config');
const swapper = require('./swapper');
const indicator = require('./indicator');
const logger = require('../utils/logger');
const telegram = require('./telegram');

let targetMin1 = -1;
let targetMin2 = -1;
let lastHour = -1;
let isPerformingSales = false;

/**
 * Generates a random integer between min and max (inclusive).
 * @param {number} min - Minimum value.
 * @param {number} max - Maximum value.
 * @returns {number} Random integer.
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Randomizes the execution minutes for the current hour based on config windows.
 * Sets targetMin1 and targetMin2.
 */
function resetSchedule() {
  const w1 = config.scheduler.window1;
  const w2 = config.scheduler.window2;
  targetMin1 = getRandomInt(w1.min, w1.max);
  targetMin2 = getRandomInt(w2.min, w2.max);
  logger.info(`[Scheduler] Próximas janelas: ${logger.colors.cyan}${targetMin1}${logger.colors.reset} e ${logger.colors.cyan}${targetMin2}${logger.colors.reset} (minutos da hora)`);
}

/**
 * Main loop function checked every 30 seconds.
 * Triggers performance of trades when the randomized minute is reached.
 * @returns {Promise<void>}
 */
async function checkAndSell() {
  // Prevent re-entrancy if a sale is already in progress
  if (isPerformingSales) return;

  try {
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();

    // Reset/Randomize on new hour
    if (hour !== lastHour) {
      resetSchedule();
      lastHour = hour;
    }

    // Window 1 trigger: If current minute matches randomized target
    if (minutes === targetMin1 && targetMin1 !== -1) {
      logger.success(`Horário sorteado atingido (${minutes} min). Iniciando operations da Janela 1...`);
      targetMin1 = -1;
      isPerformingSales = true;
      try {
        await performAllTrades();
      } finally {
        isPerformingSales = false;
      }
    }

    // Window 2 trigger: If current minute matches randomized target
    if (minutes === targetMin2 && targetMin2 !== -1) {
      logger.success(`Horário sorteado atingido (${minutes} min). Iniciando operations da Janela 2...`);
      targetMin2 = -1;
      isPerformingSales = true;
      try {
        await performAllTrades();
      } finally {
        isPerformingSales = false;
      }
    }
    
    // Status Log (every 5 minutes)
    if (now.getSeconds() < 30 && minutes % 5 === 0) {
      const next = targetMin1 !== -1 ? targetMin1 : targetMin2;
      if (next !== -1) {
        logger.info(`Aguargando próxima execução... (Meta: ${logger.colors.cyan}${next}${logger.colors.reset} min | Agora: ${minutes} min)`);
      }
    }
  } catch (error) {
    logger.error(`[Scheduler] Erro crítico no loop principal: ${error.message}`);
  }
}

/**
 * Iterates through all configured networks and tokens to verify trade conditions.
 * Consolidates decisions from multiple strategies (MA, Grid) before execution.
 * @returns {Promise<void>}
 */
async function performAllTrades() {
  const modeStr = config.strategy.dryRun ? `${logger.colors.yellow}DRY RUN${logger.colors.reset}` : `${logger.colors.red}LIVE${logger.colors.reset}`;
  console.log(`\n${logger.colors.cyan}================================================================${logger.colors.reset}`);
  logger.info(`🚀 ${logger.colors.magenta}Iniciando Ciclo de Estratégias (${modeStr})${logger.colors.reset}`);
  console.log(`${logger.colors.cyan}================================================================${logger.colors.reset}`);
  
  telegram.getInstance()?.sendMessage(`<b>🛰 Início de Ciclo</b>\nModo: ${require('../config').strategy.dryRun ? 'DRY RUN' : 'LIVE'}`);

  for (const networkName of Object.keys(config.networks)) {
    const network = config.networks[networkName];
    const netColor = networkName === 'bsc' ? logger.colors.yellow : logger.colors.magenta;
    console.log(`\n${netColor}[${networkName.toUpperCase()}]${logger.colors.reset} 🛰️  Escaneando rede...`);

    for (const token of network.tokens) {
      if (token.symbol === 'USDT') continue;

      try {
        console.log(`\n  ${logger.colors.white}💎 Token: ${token.symbol}${logger.colors.reset}`);

        const decisions = [];

        // --- STRATEGY A (e.g. 30m MA21) ---
        if (config.strategy.strategyA.enabled) {
          const sA = config.strategy.strategyA;
          const isTokenEnabled = sA.tokens[token.symbol] !== false;

          if (isTokenEnabled) {
            try {
              const trendA = await indicator.getMATrend(networkName, token.pool, sA.timeframe, sA.maPeriod);
              const posIcon = trendA.trend === 'bullish' ? '🔼' : '🔽';
              const posColor = trendA.trend === 'bullish' ? logger.colors.yellow : logger.colors.cyan;
              
              console.log(`    ${logger.colors.gray}├─${logger.colors.reset} [${sA.name}] ${posIcon} Preço ${trendA.currentPrice.toFixed(6)} | MA${sA.maPeriod} ${trendA.ma.toFixed(6)} | ${posColor}${trendA.trend === 'bullish' ? 'ACIMA' : 'ABAIXO'}${logger.colors.reset}`);
              
              if (trendA.trend === 'bullish') {
                if (sA.sellEnabled) {
                decisions.push({ direction: 'sell', amount: sA.sellAmount, type: 'token', name: sA.name, currentPrice: trendA.currentPrice });
                } else {
                  console.log(`    ${logger.colors.gray}├─${logger.colors.reset} [${sA.name}] 🚫 Venda desabilitada.`);
                }
              } else {
                if (sA.buyEnabled) {
                  decisions.push({ direction: 'buy', amount: sA.buyAmount, type: 'token', name: sA.name, currentPrice: trendA.currentPrice });
                } else {
                  console.log(`    ${logger.colors.gray}├─${logger.colors.reset} [${sA.name}] 🚫 Compra desabilitada.`);
                }
              }
            } catch (err) {
              logger.error(`[${sA.name}] Erro: ${err.message}`);
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

        // --- STRATEGY B (e.g. 4h MA21) ---
        if (config.strategy.strategyB.enabled) {
          const sB = config.strategy.strategyB;
          const isTokenEnabled = sB.tokens[token.symbol] !== false;

          if (isTokenEnabled) {
            try {
              const trendB = await indicator.getMATrend(networkName, token.pool, sB.timeframe, sB.maPeriod);
              const posIcon = trendB.trend === 'bullish' ? '🔼' : '🔽';
              const posColor = trendB.trend === 'bullish' ? logger.colors.yellow : logger.colors.cyan;

              console.log(`    ${logger.colors.gray}└─${logger.colors.reset} [${sB.name}] ${posIcon} Preço ${trendB.currentPrice.toFixed(6)} | MA${sB.maPeriod} ${trendB.ma.toFixed(6)} | ${posColor}${trendB.trend === 'bullish' ? 'ACIMA' : 'ABAIXO'}${logger.colors.reset}`);

              if (trendB.trend === 'bullish') {
                if (sB.sellEnabled) {
                  decisions.push({ direction: 'sell', amount: sB.sellAmount, type: 'token', name: sB.name, currentPrice: trendB.currentPrice });
                } else {
                  console.log(`    ${logger.colors.gray}└─${logger.colors.reset} [${sB.name}] 🚫 Venda desabilitada.`);
                }
              } else {
                if (sB.buyEnabled) {
                  decisions.push({ direction: 'buy', amount: sB.buyAmount, type: 'token', name: sB.name, currentPrice: trendB.currentPrice });
                } else {
                  console.log(`    ${logger.colors.gray}└─${logger.colors.reset} [${sB.name}] 🚫 Compra desabilitada.`);
                }
              }
            } catch (err) {
              logger.error(`[${sB.name}] Erro: ${err.message}`);
            }
          }
        }

        // --- Consolidate Decisions ---
        if (decisions.length > 0) {
          let finalDecision = null;

          if (decisions.length === 1) {
            finalDecision = decisions[0];
          } else {
            const buyDecisions = decisions.filter(d => d.direction === 'buy');
            const sellDecisions = decisions.filter(d => d.direction === 'sell');

            if (buyDecisions.length > 0 && sellDecisions.length === 0) {
              finalDecision = buyDecisions.find(d => d.name.includes('4h')) || buyDecisions[0];
              console.log(`    ${logger.colors.gray}│  ${logger.colors.green}➔ Consolidado: COMPRAR (${finalDecision.name})${logger.colors.reset}`);
            } else if (sellDecisions.length > 0 && buyDecisions.length === 0) {
              finalDecision = sellDecisions.find(d => d.name.includes('4h')) || sellDecisions[0];
              console.log(`    ${logger.colors.gray}│  ${logger.colors.red}➔ Consolidado: VENDER (${finalDecision.name})${logger.colors.reset}`);
            } else if (buyDecisions.length > 0 && sellDecisions.length > 0) {
              finalDecision = decisions.find(d => d.name.includes('4h'));
              console.log(`    ${logger.colors.gray}│  ${logger.colors.yellow}➔ Conflito! Priorizando ${finalDecision.name}: ${finalDecision.direction.toUpperCase()}${logger.colors.reset}`);
            }
          }

          if (finalDecision) {
            await swapper.swapToken(networkName, token, finalDecision.direction, finalDecision.amount, finalDecision.type, finalDecision.currentPrice);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));

      } catch (error) {
        logger.error(`[${networkName}] Erro ao processar ${token.symbol}: ${error.message}`);
      }
    }

    // --- USDT Check (Auto-buy GAS if needed) ---
    const usdtToken = network.tokens.find(t => t.symbol === 'USDT');
    if (usdtToken) {
      console.log(`\n${logger.colors.gray}--- Verificando Gas (USDT ➔ Native) ---${logger.colors.reset}`);
      await swapper.swapToken(networkName, usdtToken, 'sell');
    }
  }

  // Summary Balances
  console.log(`\n${logger.colors.cyan}================================================================${logger.colors.reset}`);
  logger.info(`💰 ${logger.colors.magenta}Gestão de Portfólio (Saldos Atuais)${logger.colors.reset}`);
  console.log(`${logger.colors.cyan}================================================================${logger.colors.reset}`);

  for (const networkName of Object.keys(config.networks)) {
    await swapper.getBalances(networkName);
  }

  console.log(`\n${logger.colors.green}✅ Ciclo de Estratégias Finalizado.${logger.colors.reset}`);
  console.log(`${logger.colors.cyan}================================================================${logger.colors.reset}\n`);
}

/**
 * Initializes the scheduler bot.
 * Sets the randomization loop and runs the first check immediately.
 */
function start() {
  console.log('--- Blockchain Auto-Trader ---');
  console.log('Wallet loaded successfully.');
  
  console.log('\n--- Estratégias Ativas ---');
  if (config.strategy.strategyA.enabled) {
    const sA = config.strategy.strategyA;
    console.log(`[Ativa] ${sA.name}: timeframe ${sA.timeframe}m, período ${sA.maPeriod}`);
  }
  if (config.strategy.strategyB.enabled) {
    const sB = config.strategy.strategyB;
    console.log(`[Ativa] ${sB.name}: timeframe ${sB.timeframe}h, período ${sB.maPeriod}`);
  }
  console.log('--------------------------\n');

  console.log('Bot initialized. Monitoring schedule (randomized mode)...');
  
  lastHour = new Date().getHours();
  resetSchedule();
  
  // Check every 30 seconds for randomized minute match
  setInterval(() => {
    checkAndSell().catch(err => {
      logger.error(`[Scheduler] Unhandled error in interval: ${err.message}`);
    });
  }, 30 * 1000);
  
  // Run once immediately
  checkAndSell().catch(err => {
    logger.error(`[Scheduler] Unhandled error in initial run: ${err.message}`);
  });
}

module.exports = {
  start,
  performAllTrades
};
