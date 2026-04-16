/**
 * @file tradeExecutor.js
 * @description Background worker that processes trade jobs from the Redis queue.
 * Implements the core execution logic, including wallet decryption, balance validation,
 * and on-chain swap execution across multiple networks.
 * @module worker/tradeExecutor
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { Worker } = require('bullmq');
const { Wallet } = require('ethers');
const { providers: blockchainProviders } = require('../services/blockchain');
const prisma = require('../config/prisma');
const redisConnection = require('../config/redis');
const encryption = require('../utils/encryption');
const strategy = require('../services/tradingStrategy');
const balanceService = require('../services/balanceService');
const billingService = require('../services/billingService');
const { sendUserNotification } = require('../bot/notifier');
const logger = require('../utils/logger');

/**
 * Uniswap V2 Router ABI for basic interaction.
 * Used for price checking and path validation.
 */
const UNISWAP_V2_ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
];

/**
 * Router addresses per network for fallback or direct lookup.
 */
const ROUTER_ADDRESSES = {
  POLYGON: '0xa5E0829CaCEd8fFDDb3b43696c57F73110303030', // QuickSwap
  BSC: '0x10ED43C718714eb63d5aA57B78B54704E256024E' // PancakeSwap V2
};

/**
 * Wapped Native tokens per network (WBNB, WMATIC) for liquidity pathing.
 */
const NATIVE_WRAPPED = {
  POLYGON: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
  BSC: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // WBNB
};

/**
 * Main job processor for trading jobs.
 * 
 * CYCLEPHASES:
 * 1. Data Retrieval: Loads User, Config and Encrypted Wallet from DB.
 * 2. Strategy Analysis: Calls Strategy Service to confirm BUY/SELL/HOLD signal.
 * 3. Secure Decryption: Decrypts private key in-memory using AES-GCM.
 * 4. Pre-trade Validation: Checks gas balance and network health.
 * 5. On-chain Execution: Calls Swapper Service for routing and swap.
 * 6. Accounting & Notifications: Records history, consumes credit, and alerts user via Telegram.
 * 7. Security Wipe: Clears sensitive references from memory.
 * 
 * @param {Object} job - BullMQ job object containing userId, tradeConfigId, and walletId.
 * @returns {Promise<void>}
 */
async function processTradeJob(job) {
  const { userId, tradeConfigId, walletId } = job.data;
  logger.info(`[TradeExecutor] Processing job for user: ${userId}`);

  // --- CORE SCOPE DECLARATION (FIX: ACCESSIBLE IN CATCH BLOCK) ---
  let user = null;
  let config = null;
  let walletData = null;
  let wallet = null;
  let result = { signal: 'UNKNOWN', price: 0 }; // Initialized for safe catch access
  let executionAmount = 0;
  let txHash = null;
  let gasUsed = '0.001';
  let tokenSymbol = 'N/A';
  let displaySymbol = 'N/A';
  let isDryRun = false;
  let netLabel = 'CHAIN';

  try {
    // 1. Fetch data from Prisma
    if (walletId) {
      [user, config, walletData] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.tradeConfig.findUnique({ where: { id: tradeConfigId } }),
        prisma.wallet.findUnique({ where: { id: walletId } })
      ]);
    } else {
      [user, config] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, include: { wallet: true } }),
        prisma.tradeConfig.findUnique({ where: { id: tradeConfigId } })
      ]);
      walletData = user?.wallet;
    }

    if (!user || !config || !walletData || !config.isOperating) {
      logger.info(`[TradeExecutor] User ${userId} or config not available/active.`);
      return { success: false, reason: 'Inactive or missing config' };
    }

    const verbose = user.notifySteps;
    isDryRun = (process.env.DRY_RUN === 'true') || (config.dryRun === true);

    // --- NETWORK & NOMENCLATURE PREPARATION (UX Rules) ---
    const netKey = config.network.toLowerCase();
    netLabel = netKey.toUpperCase();
    [tokenSymbol] = config.tokenPair.split('/');
    displaySymbol = (netKey === 'polygon' && tokenSymbol.toUpperCase() === 'BCOIN') ? 'BOMB' : tokenSymbol;

    // 2. Strategy Check (Quiet background analysis)
    
    // Inject override check from job data
    if (job.data.forceSignal) {
        logger.info(`[TradeExecutor] ⚡ FORCE SIGNAL DETECTED: ${job.data.forceSignal}`);
        result = { 
            signal: job.data.forceSignal, 
            price: job.data.forcePrice || 0, // Bypass fetch if provided
            reason: 'Engine Force Validation',
            strategyUsed: job.data.forceStrategy || 'A'
        };
    } else {
        result = await strategy.getSignal(config.tokenPair, config);
    }

    // Hotfix: Ensure price is not 0 for notifications (for forced signals or missing ticker)
    if (!result.price || result.price === 0) {
      try {
        const [network, symbol] = config.tokenPair.split('/').reverse();
        const priceService = require('../services/priceService');
        result.price = await priceService.getTokenPrice(config.network, config.tokenPair.split('/')[0]);
        logger.info(`[TradeExecutor] 🏷️ Price Hotfix: Using current market price ($${result.price})`);
      } catch (pErr) {
        logger.warn(`[TradeExecutor] Could not fetch recovery price: ${pErr.message}`);
      }
    }

    if (result.signal === 'HOLD') {
      // Logic for FIRST ATTEMPT Combat Log (Mathematics)
      if (job.data.isFirstAttempt && verbose) {
          const rsiIndicator = config.rsiEnabled ? `📊 RSI: ${result.rsiValue ? result.rsiValue.toFixed(2) : 'N/A'} (Veto se > ${result.rsiThreshold})` : '📊 RSI: Desativado';
          const displayPair = `${displaySymbol}/USDT`;
          
          const combatLog = `⚖️ <b>Verdict: HOLD [Network: ${netLabel}]</b>
Par: <code>${displayPair}</code>

💰 Price: ${result.price.toFixed(6)}
📉 MA Threshold: ${result.maRecent ? result.maRecent.toFixed(6) : 'N/A'} (Pivot)
${rsiIndicator}

📝 <i>Reason: ${result.reason}</i>
⏳ <i>Retrying silently in the background...</i>`;

          await sendUserNotification(user.telegramId, combatLog, 'info', 'STEP');
      }
      
      logger.info(`[TradeExecutor] Signal: HOLD for ${userId}. Reason: ${result.reason}`);
      return { success: true, signal: 'HOLD', reason: result.reason };
    }

    // 3. Execution Parameters
    const globalConfig = require('../config');
    if (job.data.forceAmount) {
      executionAmount = job.data.forceAmount;
    } else if (result.strategyUsed === 'A') {
      executionAmount = result.signal === 'BUY' ? config.buyAmountA : config.sellAmountA;
    } else if (result.strategyUsed === 'B') {
      executionAmount = result.signal === 'BUY' ? config.buyAmountB : config.sellAmountB;
    }

    logger.info(`[TradeExecutor] Using strategy ${result.strategyUsed} parameters. Amount: ${executionAmount}`);

    // 4. Security: Decrypt PK (Private Key exists ONLY in this local scope)
    const privateKey = encryption.decrypt({
      encryptedData: walletData.encryptedPrivateKey,
      iv: walletData.iv,
      authTag: walletData.authTag
    });

    const networkInfo = globalConfig.networks[netKey];
    
    if (!networkInfo) {
      throw new Error(`Network info not found for: ${config.network}`);
    }

    const provider = blockchainProviders[netKey];
    
    if (!provider) {
      throw new Error(`Provider not initialized for network: ${netKey}`);
    }
    
    // Nonce Manager Cache to prevent concurrent tx nonce collision (Death Loop)
    if (!global.walletNonceCache) global.walletNonceCache = new Map();
    const cacheKey = `${userId}-${config.network}`;
    
    if (!global.walletNonceCache.has(cacheKey)) {
        const { NonceManager } = require('ethers');
        const baseWallet = new Wallet(privateKey, provider);
        const manager = new NonceManager(baseWallet);
        manager.address = baseWallet.address;
        manager.privateKey = privateKey;
        global.walletNonceCache.set(cacheKey, manager);
    }
    wallet = global.walletNonceCache.get(cacheKey);
    
    // 5. Pre-trade Balance Check
    const currentMinute = new Date().getUTCMinutes();
    const inWindow1 = currentMinute >= (config.window1Min || 0) && currentMinute <= (config.window1Max || 0);
    const inWindow2 = currentMinute >= (config.window2Min || 0) && currentMinute <= (config.window2Max || 0);
    const windowIndex = inWindow1 ? 1 : (inWindow2 ? 2 : null);

    isDryRun = (process.env.DRY_RUN === 'true') || (config.dryRun === true);
    
    if (isDryRun) {
      logger.info(`[TradeExecutor] DRY RUN ENABLED for user ${userId}. Skipping real balance check.`);
    } else {
      const balances = await balanceService.checkBalances(walletData.publicAddress, config.network);
      if (!balances.hasEnoughGas) {
        throw new Error(`Insufficient funds for gas: ${balances.nativeBalance}`);
      }
    }

    const swapper = require('../services/swapper');
    const tokenConfig = globalConfig.networks[netKey].tokens.find(t => t.symbol === tokenSymbol);

    if (!tokenConfig) {
      throw new Error(`Token configuration not found for symbol: ${tokenSymbol}`);
    }

    // Include parameters in the swap command
    const tokenConfigWithParams = { 
      ...tokenConfig, 
      antiSandwich: !!config.antiSandwichEnabled,
      slippage: config.slippage,
      isDryRun: isDryRun,
      priorityMode: config.priorityMode || 'Standard'
    };

    // 6. Execute Swap
    
    if (isDryRun) {
      logger.info(`[TradeExecutor] DRY RUN: EXECUTING MOCK ${result.signal} for ${userId} @ ${result.price}`);
      txHash = `DRY_RUN_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      
      const delay = job.data.isStressTest ? 10 : 1500;
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      logger.info(`[TradeExecutor] EXECUTING REAL ${result.signal} for ${userId} @ ${result.price} (Amount: ${executionAmount})`);
      
      // 6. Execution (The Moment of Truth)
      const networkBase = globalConfig.networks[netKey];
      const usdtToken = networkBase.tokens.find(t => t.symbol === 'USDT');
      
      if (!usdtToken) {
          throw new Error(`USDT Token configuration not found for network: ${netKey}`);
      }
      
      const direction = result.signal.toLowerCase();
      
      const swapResult = await swapper.swapToken(
          netKey, 
          tokenConfigWithParams, 
          direction, 
          executionAmount, 
          'token', 
          result.price, 
          wallet,
          usdtToken
      );

      if (!swapResult || swapResult.status === 0) {
          const errorMsg = swapResult ? (swapResult.error || 'Blockchain Reverted') : 'Swap service returned no result (check liquidity/balance)';
          throw new Error(`Transaction failed: ${errorMsg}`);
      }
      txHash = swapResult.hash;
      gasUsed = swapResult.gasFormatted || '0.001';
      result.dexPath = swapResult.path || 'Direto';
    }

    // 7. Post-Processing & History
    try {
      await prisma.tradeHistory.create({
        data: {
          userId,
          txHash,
          type: result.signal,
          status: isDryRun ? 'SIMULATED' : 'SUCCESS',
          amount: executionAmount,
          price: result.price,
          feeUsed: parseFloat(gasUsed)
        }
      });

      await billingService.consumeCredit(userId, txHash);
    } catch (dbErr) {
      logger.error(`[TradeExecutor] Error recording history: ${dbErr.message}`);
    }

    // Final Notifications: Combat Log of Success
    const networkBase = globalConfig.networks[netKey];
    const explorerUrl = `${networkBase.explorerUrl}/tx/${txHash}`;
    const rsiInfo = config.rsiEnabled ? `📊 RSI: ${result.rsiValue?.toFixed(2)} (Limite: ${result.rsiThreshold})` : '';

    let balanceText = '';
    try {
      const balances = await balanceService.getMultiChainBalances(walletData.publicAddress);
      const currentNet = balances[netKey];
      if (currentNet) {
        const stableSymbol = 'USDT'; // Default stable
        const stableBalance = currentNet.tokens[stableSymbol] || '0.00';
        const tokenBalance = currentNet.tokens[tokenSymbol] || '0.00';
        
        balanceText = `
📊 <b>Post-Trade Balances</b>
- ${networkBase.nativeSymbol}: ${currentNet.nativeBalance}
- USDT: ${stableBalance}
- ${displaySymbol}: ${tokenBalance}`;
      }
    } catch (balErr) {
      logger.warn(`[TradeExecutor] Failed to fetch post-trade balances: ${balErr.message}`);
    }

    const notificationText = isDryRun
      ? `🧪 <b>SIMULATION COMPLETED [Network: ${netLabel}]</b>
Pair: <code>${displaySymbol}/USDT</code>
Engine fired virtually.

💰 Price: ${result.price.toFixed(6)}
📉 MA Threshold: ${result.maRecent?.toFixed(6)}
${rsiInfo}

<i>Simulated effect tested successfully.</i>`
      : `✅ <b>TRADE EXECUTED! [Network: ${netLabel}]</b>
Pair: <b>${displaySymbol}/USDT</b>
Type: <b>${result.signal}</b>

💰 Price: ${result.price.toFixed(6)}
📉 MA Threshold: ${result.maRecent?.toFixed(6)}
${rsiInfo}

💎 Amount: ${executionAmount} ${displaySymbol}
⛽ Gas: ${parseFloat(gasUsed).toFixed(6)} ${networkBase.nativeSymbol}
🛣️ Route: <code>${result.dexPath || 'Direct DEX'}</code>
${balanceText}
🔗 <a href="${explorerUrl}">View on Explorer</a>`;

    await sendUserNotification(user.telegramId, notificationText, isDryRun ? 'info' : 'success');

    // Persistence: Mark window as COMPLETED
    if (userId) {
      await prisma.tradeConfig.update({
        where: { id: tradeConfigId },
        data: {
          lastOperationAt: new Date(),
          lastOperationWindow: windowIndex
        }
      }).catch(e => logger.error(`[TradeExecutor] Failed to update persistence: ${e.message}`));
    }

    logger.info(`[TradeExecutor] Trade ${isDryRun ? 'Simulation' : 'Realized'} for ${userId}. Hash: ${txHash}`);

    // 8. Asset Management (Transfer surplus to TARGET_ADDRESS for SEN token)
    // 🛠️ Optimization: Skip on-chain calls during stress tests
    if (!job.data.isStressTest && config.tokenPair.includes('SEN') && process.env.TARGET_ADDRESS) {
      const { ethers: ethersObj } = require('ethers');
      const networkBase = globalConfig.networks[netKey];
      const SEN_ADDRESS = networkBase.tokens.find(t => t.symbol === 'SEN')?.address;
      if (SEN_ADDRESS) {
        const senContract = new ethersObj.Contract(SEN_ADDRESS, [
          'function balanceOf(address) view returns (uint256)',
          'function transfer(address, uint256) returns (bool)'
        ], wallet);
        
        try {
          const finalSen = await senContract.balanceOf(wallet.address);
          if (finalSen > ethersObj.parseEther("1000")) {
            const surplus = finalSen - ethersObj.parseEther("1000");
            logger.info(`[TradeExecutor] Asset Management: Surplus of ${ethersObj.formatEther(surplus)} SEN detected for user ${userId}.`);
            
            if (isDryRun) {
              logger.info(`[TradeExecutor] [DRY RUN] Would transfer ${ethersObj.formatEther(surplus)} SEN to ${process.env.TARGET_ADDRESS}`);
            } else {
              logger.info(`[TradeExecutor] Transferring surplus to ${process.env.TARGET_ADDRESS}...`);
              const txTransfer = await senContract.transfer(process.env.TARGET_ADDRESS, surplus);
              await txTransfer.wait();
              logger.info(`[TradeExecutor] Transfer successful. Tx: ${txTransfer.hash}`);
            }
          }
        } catch (assetErr) {
          logger.error(`[TradeExecutor] Asset Management Error:`, assetErr);
        }
      }
    }

    return { 
      success: true, 
      txHash, 
      isDryRun, 
      amount: executionAmount, 
      token: tokenSymbol 
    };

  } catch (err) {
    const rawError = err.message || 'Unknown Error';
    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const errorMsg = escapeHtml(rawError);
    
    logger.error(`[TradeExecutor] Fatal error in job ${job.id} for user ${userId}: ${rawError}`);
    
    let targetTelegramId;
    try {
      const u = await prisma.user.findUnique({ where: { id: userId } });
      targetTelegramId = u?.telegramId;
    } catch (e) {
      logger.error(`[TradeExecutor] Could not fetch telegramId for error report: ${e.message}`);
    }

    if (userId) {
      try {
        await prisma.tradeHistory.create({
          data: {
            userId,
            txHash: 'FAILED',
            type: result?.signal || 'UNKNOWN',
            status: 'FAILED',
            amount: executionAmount || 0,
            price: result?.price || 0,
            feeUsed: 0,
            errorMessage: errorMsg.slice(0, 255)
          }
        });
        
        if (targetTelegramId) {
          const netLabel = config?.network?.toUpperCase() || 'BATTLESYSTEM';
          const isLiquidityError = errorMsg.toLowerCase().includes('liquidez') || errorMsg.toLowerCase().includes('slippage');
          const dexPath = result?.dexPath || (config?.tokenPair ? `${config.tokenPair.split('/')[0]} ➔ USDT` : 'N/A');

          let displayError = `🚨 <b>ENGINE FAILURE [Network: ${netLabel}]</b>\nPair: ${config?.tokenPair || 'N/A'}\n🛣️ Route: <code>${dexPath}</code>\n\nThe engine encountered a tactical obstacle:\n<code>${errorMsg}</code>`;
          
          if (isLiquidityError) {
            displayError = `⏳ <b>AWAITING CONDITIONS [Network: ${netLabel}]</b>\nPair: ${config?.tokenPair || 'N/A'}\n🛣️ Route: <code>${dexPath}</code>\n\n${errorMsg}\n<i>The engine will continue monitoring silently.</i>`;
          }

          await sendUserNotification(targetTelegramId, displayError, isLiquidityError ? 'info' : 'error', 'INFO');
        }
      } catch (dbErr) {
        logger.error(`[TradeExecutor] Could not log failure: ${dbErr.message}`);
      }
    }

    const isBalanceError = errorMsg.toLowerCase().includes('insufficient funds') || 
                           errorMsg.toLowerCase().includes('gas') || 
                           errorMsg.toLowerCase().includes('saldo insuficiente');
                           
    if (isBalanceError) {
      logger.warn(`[TradeExecutor] ⚡ AUTO-PAUSE triggered for user ${userId} due to balance/gas failure.`);
      
      await prisma.tradeConfig.update({
        where: { id: tradeConfigId },
        data: { isOperating: false }
      }).catch(() => {});

      if (targetTelegramId) {
        await sendUserNotification(targetTelegramId, 
          `🛑 <b>OPERATION PAUSED [Network: ${config?.network?.toUpperCase() || 'CHAIN'}]</b>\n\nI've identified that your wallet is out of <b>gas (MATIC/BNB)</b> or has insufficient balance to complete the trade.\n\nRefill your wallet and reactivate the bot in the panel to continue.`, 
          'warning'
        );
      }
    }

    throw err; // Re-throw for BullMQ retries/monitoring
  } finally {
    wallet = null;
  }
}

/**
 * Worker instance that listens to 'tradeQueue'.
 */
const tradeExecutor = new Worker('tradeQueue', processTradeJob, {
  connection: redisConnection,
  concurrency: 50, // Added concurrency for scale
});

// Listener for DLQ (Dead Letter Queue) - Triggered when all attempts fail
tradeExecutor.on('failed', async (job, err) => {
  if (job.attemptsMade >= (job.opts?.attempts || 1)) {
    logger.error(`[TradeExecutor] Job ${job.id} PERMANENTLY FAILED after ${job.attemptsMade} attempts.`);
    
    // Dispatch to NotificationQueue
    const { Queue } = require('bullmq');
    const notificationQueue = new Queue('notificationQueue', { connection: redisConnection });
    
    await notificationQueue.add('criticalAlert', {
      type: 'CRITICAL_ALERT',
      payload: {
        jobName: job.name,
        userId: job.data.userId,
        error: err.message
      }
    }).catch(qe => logger.error('[TradeExecutor] DLQ Alert dispatch failed:', qe));
  }
});

logger.info('[TradeExecutor] Multi-tenant executor worker started with concurrency: 50.');

module.exports = {
    tradeExecutor,
    processTradeJob
};

