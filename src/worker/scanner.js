const cron = require('node-cron');
const prisma = require('../config/prisma');
const { tradeQueue } = require('../config/queue');
const logger = require('../utils/logger');

/**
 * Scanner Task: Runs every minute to identify eligible users for trading.
 */
const scannerTask = cron.schedule('* * * * *', async () => {
  const now = new Date();
  const currentMinute = now.getMinutes();
  logger.info(`[Scanner] Running scan for minute: ${currentMinute}`);

  try {
    // 1. Find eligible users (Active, with Wallet, and Credits/Subscription)
    const eligibleConfigs = await prisma.tradeConfig.findMany({
      where: {
        isOperating: true,
        user: {
          isActive: true,
          wallet: {
            id: { not: undefined } // More robust check for existence
          },
          OR: [
            { credits: { gt: 0 } },
            { subscriptionExpiresAt: { gt: now } }
          ]
        },
        OR: [
          { window1Min: currentMinute },
          { window1Max: currentMinute },
          { window2Min: currentMinute },
          { window2Max: currentMinute }
        ]
      },
      include: {
        user: {
          include: { wallet: true }
        }
      }
    });

    if (eligibleConfigs.length > 0) {
      logger.info(`[Scanner] Found ${eligibleConfigs.length} users with scheduled window for minute: ${currentMinute}`);
    } else {
      // Optional: Log if any active config exists but failed other filters
      const totalOperating = await prisma.tradeConfig.count({ where: { isOperating: true } });
      if (totalOperating > 0) {
        logger.info(`[Scanner] Scan finished. ${totalOperating} active bots exist, but none scheduled or eligible for this minute.`);
      }
    }

    // 2. Dispatch jobs to tradeQueue
    for (const config of eligibleConfigs) {
      await tradeQueue.add('executeTrade', {
        userId: config.userId,
        tradeConfigId: config.id,
        walletId: config.user.wallet.id
      }, {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
      });
      logger.info(`[Scanner] Queued trade for user: ${config.userId}`);
    }

  } catch (error) {
    logger.error('[Scanner] Critical error during scan batch:', {
      code: error.code,
      message: error.message,
      meta: error.meta
    });
    
    // If it's a known Prisma error, logging the meta helps a lot
    if (error.code) {
      console.error(`[Scanner] Prisma Error Code: ${error.code}`);
    }
  }
});

console.log('[Scanner] Multi-tenant scanner started (every 1 minute).');

module.exports = scannerTask;
