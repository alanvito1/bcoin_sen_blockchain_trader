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
const bot = require('./src/bot/index');

// Start Workers
const scanner = require('./src/worker/scanner');
const tradeExecutor = require('./src/worker/tradeExecutor');
const billingCron = require('./src/worker/billingCron');
const { notificationWorker } = require('./src/worker/notificationWorker');
const priceFetcher = require('./src/worker/priceFetcher'); // Phase 3: DB Scalability

// Basic Health Check
setInterval(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    logger.error('❌ [Database] Connection lost:', e.message);
  }
}, 60000);
