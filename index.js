const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// BigInt JSON global patch (Prisma needs this)
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const prisma = require('./src/config/prisma');
const logger = require('./src/utils/logger');

// BULLETPROOF: Global Exception Handlers
process.on('uncaughtException', (err) => {
  logger.error(`[FATAL] Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  // We don't exit(1) here to allow other motors/workers to potentially survive
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[FATAL] Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

logger.info('🚀 [System] Multi-tenant Auto-Trader initialized.');
logger.info('- Bot UI: Online');
logger.info('- Scanner: Active (1m interval)');
logger.info('- Trade Executor: Listening on Redis');

// Start Bot
let bot;
try {
  console.log('🚀 [System] Loading Bot Engine...');
  bot = require('./src/bot/index');
  console.log('✅ [System] Bot Engine Loaded.');
} catch (e) {
  console.error('💥 [FATAL] Failed to load Bot Engine:');
  console.error('Message:', e.message);
  console.error('Stack:', e.stack);
  process.exit(1);
}

// Start Workers (STAGGERED START - Resiliência DNS/RPC)
async function bootstrap() {
  try {
    console.log('🚀 [System] Initializing Workers (Staggered Mode)...');
    
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    console.log('  [1/7] - Price Fetcher (Oracle Seed)...');
    require('./src/worker/priceFetcher');
    await delay(3000); // Give time for first price pull
    
    console.log('  [2/7] - Trade Executor...');
    require('./src/worker/tradeExecutor');
    await delay(1000);
    
    console.log('  [3/7] - Scanner (Tactical Gatling)...');
    require('./src/worker/scanner');
    await delay(1000);
    
    console.log('  [4/7] - Billing Cron...');
    require('./src/worker/billingCron');
    await delay(1000);
    
    console.log('  [5/7] - Notifications...');
    require('./src/worker/notificationWorker');
    await delay(1000);

    console.log('  [6/7] - Payout Splitter...');
    require('./src/worker/payoutWorker');
    await delay(1000);

    console.log('  [7/7] - Transit Monitor...');
    require('./src/worker/monitorWorker');

    console.log('✅ [System] All Workers Initialized and Synchronized.');
  } catch (workerErr) {
    console.error('💥 [FATAL] Worker Initialization Failed:');
    console.error('Message:', workerErr.message);
    console.error('Stack:', workerErr.stack);
    process.exit(1);
  }
}

bootstrap();

// Basic Health Check
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    logger.error('❌ [Database] Connection lost:', e.message);
  }
}, 60000);
