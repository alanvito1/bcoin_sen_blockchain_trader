const { Worker } = require('bullmq');
const redisConnection = require('../config/redis');

const tradeWorker = new Worker('tradeQueue', async (job) => {
  console.log(`[TradeWorker] Processing job ${job.id}:`, job.data);
  // Blockchain logic will go here in next phases
}, {
  connection: redisConnection
});

tradeWorker.on('completed', (job) => {
  console.log(`[TradeWorker] Job ${job.id} completed!`);
});

tradeWorker.on('failed', (job, err) => {
  console.error(`[TradeWorker] Job ${job.id} failed:`, err);
});

console.log('[TradeWorker] Standardized worker started.');

module.exports = tradeWorker;
