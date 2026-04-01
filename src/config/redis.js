const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisOptions = {
  maxRetriesPerRequest: null, // mandatory for BullMQ
  connectTimeout: 10000, // 10s timeout to prevent process hang
};

// Auto-detect TLS for rediss:// (Common in Upstash/Managed Redis)
if (redisUrl.startsWith('rediss://')) {
  redisOptions.tls = {
    rejectUnauthorized: false // Necessary for some managed providers
  };
}

const redisConnection = new Redis(redisUrl, redisOptions);

redisConnection.on('connect', () => console.log('✅ [Redis] Connection established.'));
redisConnection.on('error', (err) => console.error('❌ [Redis] Connection error:', err.message));

module.exports = redisConnection;
