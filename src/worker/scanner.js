const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
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

  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID 
    ? BigInt(process.env.ADMIN_TELEGRAM_ID) 
    : (process.env.TELEGRAM_CHAT_ID ? BigInt(process.env.TELEGRAM_CHAT_ID) : null);

  try {
    // 1. Find eligible users (Active, with Wallet)
    // Credits/Subscription gate is now conditional (bypassed for ADMIN)
    const eligibleConfigs = await prisma.tradeConfig.findMany({
      where: {
        isOperating: true,
        user: {
          isActive: true,
          wallet: {
            id: { not: undefined }
          }
        }
      },
      include: {
        user: {
          include: { wallet: true }
        }
      }
    });

    // 2. Filter by Credits/Subscription and Schedule
    const filteredConfigs = eligibleConfigs.filter(config => {
      const { user } = config;
      
      // Gate A: Credits/Subscription (Bypass for ADMIN)
      const isSubscribed = user.subscriptionExpiresAt && user.subscriptionExpiresAt > now;
      // Gate A: Credits/Subscription (Bypass for ADMIN)
      const isSubscribed = user.subscriptionExpiresAt && user.subscriptionExpiresAt > now;
      const possessesCredits = user.credits > 0;
      const isAdmin = adminTelegramId && user.telegramId === adminTelegramId;
      
      logger.debug(`[Scanner] ${user.telegramId} Check: isAdmin=${!!isAdmin}, hasCredits=${possessesCredits}, isSubscribed=${!!isSubscribed}`);

      if (!isAdmin && !isSubscribed && !possessesCredits) {
        logger.warn(`[Scanner] User ${user.telegramId} skipped: No credits/subscription.`);
        return false;
      }
 
      // Gate B: Schedule & Cooldown
      let isScheduled = false;
      const lastOp = config.lastOperationAt ? new Date(config.lastOperationAt) : null;
      
      if (config.scheduleMode === 'interval') {
        const interval = config.intervalMinutes || 60;
        isScheduled = currentMinute % interval === 0;
        
        if (isScheduled && lastOp && (now - lastOp) < (interval * 0.8 * 60 * 1000)) {
          return false;
        }

        if (!isScheduled) {
          logger.debug(`[Scanner] ${user.telegramId} [${config.network}] skipped: Next interval at ${Math.ceil(currentMinute / interval) * interval}m`);
        }
      } else {
        // Window Mode (One-Shot per Window)
        const inWindow1 = currentMinute >= (config.window1Min || 0) && currentMinute <= (config.window1Max || 0);
        const inWindow2 = currentMinute >= (config.window2Min || 0) && currentMinute <= (config.window2Max || 0);
        
        const currentWindow = inWindow1 ? 1 : (inWindow2 ? 2 : null);

        if (currentWindow) {
          const isSameDay = lastOp && lastOp.toDateString() === now.toDateString();
          const alreadyDone = isSameDay && config.lastOperationWindow === currentWindow;

          if (alreadyDone) {
            logger.debug(`[Scanner] ${user.telegramId} [${config.network}] Window ${currentWindow} already completed today.`);
            return false;
          }

          const seed = parseInt(config.id.replace(/-/g, '').slice(0, 8), 16) + currentWindow;
          const windowMin = currentWindow === 1 ? config.window1Min : config.window2Min;
          const windowMax = currentWindow === 1 ? config.window1Max : config.window2Max;
          const windowSize = (windowMax - windowMin) + 1;
          const targetMinute = windowMin + (seed % windowSize);

          isScheduled = currentMinute >= targetMinute;

          logger.debug(`[Scanner] ${user.telegramId} Window ${currentWindow}: target=${targetMinute}, current=${currentMinute}, isScheduled=${isScheduled}`);
          
          if (!isScheduled) {
            logger.debug(`[Scanner] ${user.telegramId} [${config.network}] Waiting for target minute ${targetMinute} (Current: ${currentMinute})`);
          } else {
            logger.info(`[Scanner] ${user.telegramId} [${config.network}] Window ${currentWindow} active. Target ${targetMinute} reached. Attempting trade...`);
          }
        } else {
          logger.debug(`[Scanner] ${user.telegramId} not in any window (Minute: ${currentMinute})`);
        }
      }
      return isScheduled;
    });

    if (filteredConfigs.length > 0) {
      logger.info(`[Scanner] Found ${filteredConfigs.length} users with scheduled trigger for minute: ${currentMinute}`);
    } else {
      const totalOperating = await prisma.tradeConfig.count({ where: { isOperating: true } });
      if (totalOperating > 0) {
        logger.info(`[Scanner] Scan finished. ${totalOperating} active bots exist, but none scheduled or eligible for this minute.`);
      }
    }

    // 3. Dispatch jobs to tradeQueue
    for (const config of filteredConfigs) {
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
      logger.error(`[Scanner] Prisma Error Code: ${error.code}`);
    }
  }
});

logger.info('[Scanner] Multi-tenant scanner started (every 1 minute).');

module.exports = scannerTask;
