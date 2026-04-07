const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Worker } = require('bullmq');
const redisConnection = require('../config/redis');
const { sendUserNotification } = require('../bot/notifier');
const logger = require('../utils/logger');

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID || process.env.TELEGRAM_CHAT_ID;

/**
 * Worker for processing notifications (async).
 * Currently used for critical DLQ alerts.
 */
const notificationWorker = new Worker('notificationQueue', async (job) => {
  const { type, payload } = job.data;
  logger.info(`[NotificationWorker] Processing ${type} for user: ${payload.userId || 'ADMIN'}`);

  if (type === 'CRITICAL_ALERT') {
    if (!ADMIN_ID) {
      return logger.warn('[NotificationWorker] No ADMIN_TELEGRAM_ID configured for critical alert.');
    }
    const alertMsg = `<b>🚨 ALERTA CRÍTICO: FALHA PERSISTENTE</b>\n\n` +
                     `<b>Job:</b> ${payload.jobName}\n` +
                     `<b>Usuário:</b> ${payload.userId}\n` +
                     `<b>Erro Final:</b> <code>${payload.error}</code>\n\n` +
                     `<i>O robô do usuário pode ter sido afetado. Verifique os logs.</i>`;
    
    await sendUserNotification(ADMIN_ID, alertMsg, 'error', 'ERROR');
  }

  // Handle other notification types here (SUCCESS_TRADE, etc.)
}, {
  connection: redisConnection,
  concurrency: 5 // Notifications don't need high concurrency
});

notificationWorker.on('completed', (job) => {
  logger.info(`[NotificationWorker] Job ${job.id} dispatched successfully.`);
});

notificationWorker.on('failed', (job, err) => {
  logger.error(`[NotificationWorker] Job ${job.id} failed to dispatch:`, err);
});

logger.info('[NotificationWorker] Started and ready for alerts.');

module.exports = notificationWorker;
