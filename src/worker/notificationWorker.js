const { Worker } = require('bullmq');
const redisConnection = require('../config/redis');

const notificationWorker = new Worker('notificationQueue', async (job) => {
  console.log(`[NotificationWorker] Processing job ${job.id}:`, job.data);
  // Telegram notification logic will go here
}, {
  connection: redisConnection
});

notificationWorker.on('completed', (job) => {
  console.log(`[NotificationWorker] Job ${job.id} completed!`);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`[NotificationWorker] Job ${job.id} failed:`, err);
});

console.log('[NotificationWorker] Standardized worker started.');

module.exports = notificationWorker;
