const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// BigInt JSON global patch (Prisma needs this)
BigInt.prototype.toJSON = function () {
  return this.toString();
};
const prisma = require('./src/config/prisma');
const logger = require('./src/utils/logger');

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

// Start Workers
try {
  console.log('🚀 [System] Initializing Workers...');
  
  console.log('  - Scanner...');
  const scanner = require('./src/worker/scanner');
  
  console.log('  - Trade Executor...');
  const tradeExecutor = require('./src/worker/tradeExecutor');
  
  console.log('  - Billing Cron...');
  const billingCron = require('./src/worker/billingCron');
  
  console.log('  - Notifications...');
  const { notificationWorker } = require('./src/worker/notificationWorker');
  
  console.log('  - Price Fetcher...');
  const priceFetcher = require('./src/worker/priceFetcher');

  console.log('✅ [System] All Workers Initialized.');
} catch (workerErr) {
  console.error('💥 [FATAL] Worker Initialization Failed:');
  console.error('Message:', workerErr.message);
  console.error('Stack:', workerErr.stack);
  process.exit(1);
}

// Basic Health Check
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    logger.error('❌ [Database] Connection lost:', e.message);
  }
}, 60000);
