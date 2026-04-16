const bot = require('../config/bot');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

/**
 * Sends an asynchronous notification to a Telegram user.
 * @param {string|bigint} telegramId - User's Telegram ID.
 * @param {string} message - Notification text (HTML supported).
 * @param {string} type - info, success, warning, error.
 * @param {string} category - TRADE, BALANCE, STEP, ERROR (Mapped to user settings).
 */
async function sendUserNotification(telegramId, message, type = 'info', category = 'TRADE') {
  try {
    if (!telegramId) return;
    
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId.toString()) },
      select: { notifyTrades: true, notifyBalances: true, notifySteps: true }
    });

    if (user) {
      if (category === 'TRADE' && !user.notifyTrades) return;
      if (category === 'BALANCE' && !user.notifyBalances) return;
      if (category === 'STEP' && !user.notifySteps) return;
    }

    const formattedMessage = formatMessage(message, type);
    
    // Retry Logic with Exponential Backoff
    let attempts = 0;
    const maxAttempts = 3;
    let success = false;

    while (attempts < maxAttempts && !success) {
      try {
        if (attempts > 0) {
            logger.warn(`[Notifier] 🔄 Tentativa ${attempts + 1}/${maxAttempts} para ${telegramId}...`);
            await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Backoff
        }

        await bot.telegram.sendMessage(telegramId.toString(), formattedMessage, { parse_mode: 'HTML' });
        success = true;
      } catch (error) {
        attempts++;
        const isNetworkError = error.code === 'EAI_AGAIN' || error.message.includes('EAI_AGAIN') || error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET');
        
        if (attempts >= maxAttempts || !isNetworkError) {
            if (error.description && error.description.includes('bot was blocked by the user')) {
                console.warn(`[Notifier] User ${telegramId} blocked the bot. Updating visibility.`);
                await prisma.user.update({
                  where: { telegramId: BigInt(telegramId) },
                  data: { isActive: false }
                });
            } else {
                console.error(`[Notifier] ❌ Falha definitiva ao enviar para ${telegramId.toString()}: ${error.message || 'Unknown'}`);
            }
            break;
        }
      }
    }

    if (success && attempts > 0) {
        logger.info(`[Notifier] ✅ Entregue com sucesso após ${attempts} tentativas extras.`);
    } else if (success) {
        logger.info(`[Notifier] ✅ Enviado com sucesso para ${telegramId}`);
    }
  } catch (globalError) {
    logger.error(`[Notifier] Global Error: ${globalError.message}`);
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

/**
 * Sends a notification directly to the ADMIN_ID.
 */
async function sendAdminNotification(message, type = 'error') {
  const adminId = process.env.ADMIN_ID;
  if (!adminId) {
    logger.warn('[Notifier] ADMIN_ID not set. Skipping admin notification.');
    return;
  }
  return sendUserNotification(adminId, message, type, 'ERROR');
}

module.exports = {
  sendUserNotification,
  sendAdminNotification
};
