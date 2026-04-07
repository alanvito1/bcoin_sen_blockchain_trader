/**
 * Healthcheck script for Docker container
 * Monitors Prisma (Database) and Redis (Cache/Queue) connectivity.
 * Exits with 0 if healthy, 1 if unhealthy.
 */
const prisma = require('./config/prisma');
const redis = require('./config/redis');
const logger = require('./utils/logger');

async function checkHealth() {
  const health = {
    database: false,
    redis: false,
  };

  try {
    // 1. Prisma Check: Run a simple query
    await prisma.$queryRaw`SELECT 1`;
    health.database = true;
  } catch (err) {
    logger.error('💔 [Healthcheck] Database connection failed:', err.message);
  }

  try {
    // 2. Redis Check: Ping the server
    const status = await redis.ping();
    if (status === 'PONG') {
      health.redis = true;
    }
  } catch (err) {
    logger.error('💔 [Healthcheck] Redis connection failed:', err.message);
  }

  // Final Evaluation
  if (health.database && health.redis) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Set a timeout for the check to prevent hanging
const timeout = setTimeout(() => {
  logger.error('💔 [Healthcheck] Timed out (10s)');
  process.exit(1);
}, 10000);

checkHealth().finally(() => clearTimeout(timeout));
