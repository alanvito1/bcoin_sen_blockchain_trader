'use strict';

const logger = require('../../utils/logger');

const userRequests = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;     // 30 commands/actions per min

/**
 * Basic Rate Limiting Middleware for Telegraf
 */
module.exports = async (ctx, next) => {
  if (!ctx.from) return next();

  const userId = ctx.from.id;
  const isAdmin = String(userId) === String(process.env.ADMIN_TELEGRAM_ID);

  // Admin is exempt from rate limiting
  if (isAdmin) return next();

  const now = Date.now();
  const userData = userRequests.get(userId) || { count: 0, startTime: now };

  // Reset window if time passed
  if (now - userData.startTime > RATE_LIMIT_WINDOW_MS) {
    userData.count = 1;
    userData.startTime = now;
  } else {
    userData.count++;
  }

  userRequests.set(userId, userData);

  if (userData.count > MAX_REQUESTS_PER_WINDOW) {
    logger.warn(`[RateLimit] User ${userId} exceeded limit (${userData.count} requests).`);
    
    if (ctx.callbackQuery) {
      return ctx.answerCbQuery('⚠️ Muita calma! Você atingiu o limite de comandos por minuto. Tente novamente em breve.', { show_alert: true });
    }
    
    // Only reply once to avoid spamming the user back
    if (userData.count === MAX_REQUESTS_PER_WINDOW + 1) {
      return ctx.reply('⚠️ Você enviou muitos comandos em pouco tempo. Por favor, aguarde um minuto para continuar operando.');
    }
    return; // Ignore further requests in this window
  }

  return next();
};
