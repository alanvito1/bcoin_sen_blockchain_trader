const logger = require('../../utils/logger');

/**
 * Global Telemetry Middleware for Bot Interactions
 * Logs incoming updates, callback queries, and response times.
 */
const telemetryMiddleware = async (ctx, next) => {
  const start = Date.now();
  const updateType = ctx.updateType;
  const username = ctx.from?.username || ctx.from?.id || 'unknown';
  const chatType = ctx.chat?.type || 'unknown';

  let logMsg = `[INCOMING] Type: ${updateType} | From: ${username} | Chat: ${chatType}`;
  
  if (ctx.message?.text) {
    logMsg += ` | Text: ${ctx.message.text.substring(0, 50)}`;
  } else if (ctx.callbackQuery?.data) {
    logMsg += ` | Callback: ${ctx.callbackQuery.data}`;
  }

  logger.info(logMsg);

  try {
    await next();
  } catch (err) {
    logger.error(`[TELEMETRY ERROR] during next(): ${err.message}`, { stack: err.stack });
    throw err;
  }

  const ms = Date.now() - start;
  logger.info(`[OUTGOING] Handled ${updateType} in ${ms}ms`);
};

module.exports = { telemetryMiddleware };
