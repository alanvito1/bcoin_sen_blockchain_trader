const Redis = require('ioredis');
const logger = require('../utils/logger');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOptions = {
  maxRetriesPerRequest: null, // mandatory for BullMQ
  connectTimeout: 10000,
  retryStrategy(times) {
    const delay = Math.min(Math.pow(2, times) * 100, 30000); // Exponential backoff up to 30s
    logger.warn(`[Redis] Retrying connection... (Attempt ${times}, delay: ${delay}ms)`);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
  },
};

// Auto-detect TLS for rediss:// (Common in Upstash/Managed Redis)
if (redisUrl.startsWith('rediss://')) {
  redisOptions.tls = {
    rejectUnauthorized: false
  };
}

const redisConnection = new Redis(redisUrl, redisOptions);

redisConnection.on('connect', () => logger.info('✅ [Redis] Connection established.'));
redisConnection.on('error', (err) => logger.error('❌ [Redis] Connection error:', err));

module.exports = redisConnection;
