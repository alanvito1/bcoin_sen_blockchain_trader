const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});

// Audit connection URL for pooling parameters
const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('connection_limit')) {
  logger.warn('⚠️ [Prisma] DATABASE_URL does not specify connection_limit. For high-scale (500 tenants), ensure it includes ?connection_limit=50');
}

// Log long-running queries for performance monitoring
prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    logger.warn(`🐌 [Prisma] Slow Query: ${e.query} (${e.duration}ms)`);
  }
});

prisma.$on('error', (e) => {
  logger.error('❌ [Prisma] Database Error:', e.message);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  logger.info('[Prisma] Disconnected on SIGINT');
  process.exit(0);
});

module.exports = prisma;
