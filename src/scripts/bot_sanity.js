/**
 * @file bot_sanity.js
 * @description Production sanity check for the trading bot ecosystem.
 * Verifies connectivity to all external services (Telegram, DB, Redis, RPC).
 */

const { Telegraf } = require('telegraf');
const prisma = require('../config/prisma');
const redisConnection = require('../config/redis');
const { providers } = require('../services/blockchain');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

async function runSanityCheck() {
  console.log('\n🏥 [SANITY CHECK] Iniciando diagnóstico de produção...\n');
  let failures = 0;

  // 1. Telegram API Connectivity
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN missing in .env');
    
    // Simple fetch to verify token validity and network
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      console.log('✅ [Telegram] Conectividade e Token OK (Bot: ' + data.result.username + ')');
    } else {
      throw new Error('Invalid Token or API failure: ' + data.description);
    }
  } catch (err) {
    console.error('❌ [Telegram] FALHA:', err.message);
    failures++;
  }

  // 2. Prisma / Database Latency
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Date.now() - start;
    console.log(`✅ [Database] Prisma conectado (Latência: ${ms}ms)`);
  } catch (err) {
    console.error('❌ [Database] FALHA na conexão Prisma:', err.message);
    failures++;
  }

  // 3. Redis / BullMQ
  try {
    await redisConnection.ping();
    console.log('✅ [Redis] Conectividade BullMQ/Cache OK');
  } catch (err) {
    console.error('❌ [Redis] FALHA na conexão Redis:', err.message);
    failures++;
  }

  // 4. Blockchain RPCs (Polygon & BSC)
  const networks = ['bsc', 'polygon'];
  for (const net of networks) {
    try {
      const provider = providers[net];
      const block = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || feeData.maxPriorityFeePerGas || 0n;
      
      console.log(`✅ [Blockchain] ${net.toUpperCase()} OK (Bloco: ${block}, Gas: ${ethers.formatUnits(gasPrice, 'gwei')} gwei)`);
    } catch (err) {
      console.error(`❌ [Blockchain] ${net.toUpperCase()} FALHA:`, err.message);
      failures++;
    }
  }

  // Summary
  console.log('\n-----------------------------------------');
  if (failures === 0) {
    console.log('🏁 [RESULTADO] TUDO PRONTO PARA GO-LIVE! 🚀');
  } else {
    console.log(`⚠️ [RESULTADO] ${failures} falha(s) detectada(s). Corrija antes do deploy.`);
  }
  console.log('-----------------------------------------\n');

  process.exit(failures === 0 ? 0 : 1);
}

runSanityCheck().catch(err => {
  console.error('[FATAL] Erro inesperado no sanity check:', err);
  process.exit(1);
});
