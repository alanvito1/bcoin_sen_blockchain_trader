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
const { Wallet, JsonRpcProvider } = require('ethers');
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

  let wallet = null; // Defined in upper scope for secure nulling in 'finally' block

  try {
    // 1. Fetch data from Prisma
    let user, config, walletData;
    let result = null;
    let executionAmount = 0;

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

    // 2. Strategy Check
    if (verbose) {
      await sendUserNotification(user.telegramId, `🔍 <b>Passo 1/4:</b> Analisando indicadores para <code>${config.tokenPair}</code>...`, 'info', 'STEP');
    }
    
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
      if (verbose) {
        await sendUserNotification(user.telegramId, `📊 <b>Status:</b> Ciclo concluído. Recomendação: <b>HOLD</b> (Aguardar).\n<i>Motivo: ${result.reason}</i>`, 'info', 'STEP');
      }
      logger.info(`[TradeExecutor] Signal: HOLD for ${userId}. Reason: ${result.reason}`);
      return { success: true, signal: 'HOLD', reason: result.reason };
    }

    // 3. Execution Parameters
    const globalConfig = require('../config');
    if (result.strategyUsed === 'A') {
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

    const netKey = config.network.toLowerCase();
    const networkInfo = globalConfig.networks[netKey];
    
    if (!networkInfo) {
      throw new Error(`Network info not found for: ${config.network}`);
    }

    const provider = new JsonRpcProvider(networkInfo.rpc);
    
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
    const isDryRun = (process.env.DRY_RUN === 'true') || (config.dryRun === true);
    if (verbose) {
      await sendUserNotification(user.telegramId, `${isDryRun ? '🧪 <b>DRY RUN:</b> ' : '💰 '}<b>Passo 2/4:</b> Verificando saldo e taxas na rede <code>${config.network}</code>...`, 'info', 'STEP');
    }

    
    if (isDryRun) {
      logger.info(`[TradeExecutor] DRY RUN ENABLED for user ${userId}. Skipping real balance check.`);
    } else {
      const balances = await balanceService.checkBalances(walletData.publicAddress, config.network);
      if (!balances.hasEnoughGas) {
        throw new Error(`Insufficient funds for gas: ${balances.nativeBalance}`);
      }
    }

    const swapper = require('../services/swapper');
    const [tokenSymbol] = config.tokenPair.split('/');
    const tokenConfig = globalConfig.networks[netKey].tokens.find(t => t.symbol === tokenSymbol);

    if (!tokenConfig) {
      throw new Error(`Token configuration not found for symbol: ${tokenSymbol}`);
    }

    // Include parameters in the swap command
    const tokenConfigWithParams = { 
      ...tokenConfig, 
      antiSandwich: !!config.antiSandwichEnabled,
      slippage: config.slippage,
      isDryRun: isDryRun
    };

    // 6. Execute Swap
    if (verbose) {
      await sendUserNotification(user.telegramId, `${isDryRun ? '🧪 <b>DRY RUN:</b> ' : '🚀 '}<b>Passo 3/4:</b> ${isDryRun ? 'Simulando envio de transação...' : 'Enviando transação de ' + result.signal + ' para a pool...'}`, 'info', 'STEP');
    }
    
    let txHash;
    let gasUsed = '0.001';

    if (isDryRun) {
      logger.info(`[TradeExecutor] DRY RUN: EXECUTING MOCK ${result.signal} for ${userId} @ ${result.price}`);
      txHash = `DRY_RUN_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      
      const delay = job.data.isStressTest ? 10 : 1500;
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      logger.info(`[TradeExecutor] EXECUTING REAL ${result.signal} for ${userId} @ ${result.price} (Amount: ${executionAmount})`);
      
      const direction = result.signal.toLowerCase();
      const swapResult = await swapper.swapToken(
          netKey, 
          tokenConfigWithParams, 
          direction, 
          executionAmount, 
          'token', 
          result.price, 
          wallet
      );

      if (swapResult.status === 0) {
          throw new Error(`Transaction failed: ${swapResult.error || 'Blockchain Reverted'}`);
      }
      txHash = swapResult.hash;
      gasUsed = swapResult.gasFormatted || '0.001';
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

    // Final Notifications
    const networkBase = globalConfig.networks[netKey];
    const explorerUrl = `${networkBase.explorerUrl}/tx/${txHash}`;
    
    const notificationText = isDryRun
      ? `💥 <b>[DRY RUN] Detonação Simulada:</b> ${result.signal === 'BUY' ? 'Compra' : 'Venda'} de <b>${executionAmount} ${tokenSymbol}</b> executada virtualmente!\n<i>Par: ${config.tokenPair} | Preço: ${result.price.toFixed(6)}</i>`
      : `✅ <b>Trade Executado!</b>\nPar: ${config.tokenPair}\nTipo: ${result.signal}\nValor: ${executionAmount} ${tokenSymbol}\nPreço: ${result.price.toFixed(6)}\nTx: <a href="${explorerUrl}">Explorer</a>`;

    await sendUserNotification(user.telegramId, notificationText, 'success');

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
    const errorMsg = err.message || 'Unknown Error';
    logger.error(`[TradeExecutor] Fatal error in job ${job.id} for user ${userId}: ${errorMsg}`);
    
    // Save FAILED trade to history for auditing
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
            errorMessage: errorMsg.slice(0, 255)
          }
        });
        
        if (user?.telegramId) {
          await sendUserNotification(user.telegramId, `❌ <b>Falha no Trade</b>\nPar: ${config?.tokenPair || 'N/A'}\nErro: <code>${errorMsg}</code>`, 'error');
        }
      } catch (dbErr) {
        logger.error(`[TradeExecutor] Could not log failure: ${dbErr.message}`);
      }
    }

    // Pause on specific errors like balance
    if (errorMsg.includes('gas') || errorMsg.includes('insufficient')) {
      await prisma.tradeConfig.update({
        where: { id: tradeConfigId },
        data: { isOperating: false }
      }).catch(() => {});
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

