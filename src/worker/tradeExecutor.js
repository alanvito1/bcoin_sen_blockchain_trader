/**
 * @file tradeExecutor.js
 * @description Background worker that processes trade jobs from the Redis queue.
 * Implements the core execution logic, including wallet decryption, balance validation,
 * and on-chain swap execution across multiple networks.
 * @module worker/tradeExecutor
 */

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
  console.log(`[TradeExecutor] Processing job for user: ${userId}`);

  let wallet = null; // Defined in upper scope for secure nulling in 'finally' block

  try {
    // 1. Fetch data from Prisma
    const [user, config, walletData] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.tradeConfig.findUnique({ where: { id: tradeConfigId } }),
      prisma.wallet.findUnique({ where: { id: walletId } })
    ]);

    if (!user || !config || !walletData || !config.isOperating) {
      return console.log(`[TradeExecutor] User ${userId} or config not available/active.`);
    }

    const verbose = user.notifySteps;

    // 2. Strategy Check
    if (verbose) {
      await sendUserNotification(user.telegramId, `🔍 <b>Passo 1/4:</b> Analisando indicadores para <code>${config.tokenPair}</code>...`, 'info', 'STEP');
    }
    
    const result = await strategy.getSignal(config.tokenPair, config);
    if (result.signal === 'HOLD') {
      if (verbose) {
        await sendUserNotification(user.telegramId, `📊 <b>Status:</b> Ciclo concluído. Recomendação: <b>HOLD</b> (Aguardar).\n<i>Motivo: ${result.reason}</i>`, 'info', 'STEP');
      }
      return console.log(`[TradeExecutor] Signal: HOLD for ${userId}. Reason: ${result.reason}`);
    }

    // 3. Execution Parameters
    const globalConfig = require('../config');
    let executionAmount;
    if (result.strategyUsed === 'A') {
      executionAmount = result.signal === 'BUY' ? config.buyAmountA : config.sellAmountA;
    } else if (result.strategyUsed === 'B') {
      executionAmount = result.signal === 'BUY' ? config.buyAmountB : config.sellAmountB;
    }

    console.log(`[TradeExecutor] Using strategy ${result.strategyUsed} parameters. Amount: ${executionAmount}`);

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
    wallet = new Wallet(privateKey, provider);
    
    // 5. Pre-trade Balance Check
    const isDryRun = process.env.DRY_RUN === 'true';
    if (verbose) {
      await sendUserNotification(user.telegramId, `${isDryRun ? '🧪 <b>DRY RUN:</b> ' : '💰 '}<b>Passo 2/4:</b> Verificando saldo e taxas na rede <code>${config.network}</code>...`, 'info', 'STEP');
    }
    
    if (isDryRun) {
      console.log(`[TradeExecutor] DRY RUN ENABLED. Skipping real balance check for ${userId}.`);
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

    // Include the user's MEV/Anti-Sandwich preference in the swap command
    const tokenConfigWithAntiSandwich = { 
      ...tokenConfig, 
      antiSandwich: !!config.antiSandwichEnabled 
    };

    // 6. Execute Swap (Real execution with Routing & Anti-Sandwich)
    if (verbose) {
      await sendUserNotification(user.telegramId, `${isDryRun ? '🧪 <b>DRY RUN:</b> ' : '🚀 '}<b>Passo 3/4:</b> ${isDryRun ? 'Simulando envio de transação...' : 'Enviando transação de ' + result.signal + ' para a pool...'}`, 'info', 'STEP');
    }
    
    let txHash;
    let gasUsed = '0.001';

    if (isDryRun) {
      console.log(`[TradeExecutor] DRY RUN: EXECUTING MOCK ${result.signal} for ${userId} @ ${result.price}`);
      txHash = `DRY_RUN_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`[TradeExecutor] EXECUTING REAL ${result.signal} for ${userId} @ ${result.price} (Amount: ${executionAmount})`);
      
      const direction = result.signal.toLowerCase();
      const swapResult = await swapper.swapToken(
          netKey, 
          tokenConfigWithAntiSandwich, 
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

    await prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: 1 } }
    });

    await billingService.consumeCredit(userId, txHash);

    // Final Notifications
    const explorerUrl = `${globalConfig.networks[netKey].explorerUrl}/tx/${txHash}`;

    await sendUserNotification(user.telegramId, 
      `✅ <b>Trade Executado!</b>\nPar: ${config.tokenPair}\nTipo: ${result.signal}\nValor: ${executionAmount}\nTx: <a href="${explorerUrl}">Explorer</a>`, 
      'success'
    );

    console.log(`[TradeExecutor] Trade success for ${userId}. Hash: ${txHash}`);

  } catch (error) {
    console.error(`[TradeExecutor] Failed trade for ${userId}:`, error.message);
    
    // Automatic pause on zero balance (Insuficient Gas)
    if (error.message.includes('gas') || error.message.includes('insufficient')) {
      const userToNotify = await prisma.user.findUnique({ where: { id: userId } });
      if (userToNotify) {
        await prisma.tradeConfig.update({
          where: { id: tradeConfigId },
          data: { isOperating: false }
        });
        await sendUserNotification(userToNotify.telegramId, '🚨 Seu robô foi pausado por falta de saldo para taxas.', 'error');
      }
    }

    await prisma.tradeHistory.create({
      data: {
        userId,
        type: 'UNKNOWN',
        status: 'FAILED',
        amount: 0,
        price: 0,
        feeUsed: 0,
        errorMessage: error.message
      }
    });
  } finally {
    // 8. Wipe Sensitive references from memory
    wallet = null;
  }
}

/**
 * Worker instance that listens to 'tradeQueue'.
 */
const tradeExecutor = new Worker('tradeQueue', processTradeJob, {
  connection: redisConnection
});

console.log('[TradeExecutor] Multi-tenant executor worker started.');

module.exports = {
    tradeExecutor,
    processTradeJob
};

