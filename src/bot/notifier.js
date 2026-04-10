const { Telegraf } = require('telegraf');
const prisma = require('../config/prisma');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

/**
 * Sends an asynchronous notification to a Telegram user.
 * @param {string|bigint} telegramId - User's Telegram ID.
 * @param {string} message - Notification text (HTML supported).
 * @param {string} type - info, success, warning, error.
 * @param {string} category - TRADE, BALANCE, STEP, ERROR (Mapped to user settings).
 */
async function sendUserNotification(telegramId, message, type = 'info', category = 'TRADE') {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { notifyTrades: true, notifyBalances: true, notifySteps: true }
    });

    if (user) {
      if (category === 'TRADE' && !user.notifyTrades) return;
      if (category === 'BALANCE' && !user.notifyBalances) return;
      if (category === 'STEP' && !user.notifySteps) return;
    }

    const formattedMessage = formatMessage(message, type);
    logger.info(`[Notifier] 📨 Sending to ${telegramId}: ${message.slice(0, 50)}...`);
    await bot.telegram.sendMessage(telegramId, formattedMessage, { parse_mode: 'HTML' });
    logger.info(`[Notifier] ✅ Sent successfully to ${telegramId}`);
  } catch (error) {
    if (error.description && error.description.includes('bot was blocked by the user')) {
      console.warn(`[Notifier] User ${telegramId} blocked the bot. Updating visibility.`);
      await prisma.user.update({
        where: { telegramId: BigInt(telegramId) },
        data: { isActive: false }
      });
    } else {
        console.error(`[Notifier] Failed to send message to ${telegramId.toString()}. Reason: ${error.message || 'Unknown'}`);
        if (error.response) console.error(`[Telegram API Error]:`, error.response);
    }
  }
}

function formatMessage(message, type) {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '🚨'
  };
  return `${icons[type] || '🔔'} ${message}`;
}

module.exports = {
  sendUserNotification
};
