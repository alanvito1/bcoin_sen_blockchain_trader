const Redis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // mandatory for BullMQ
});

module.exports = redisConnection;
