const { Queue } = require('bullmq');
const redisConnection = require('./redis');

const tradeQueue = new Queue('tradeQueue', {
  connection: redisConnection
});

const notificationQueue = new Queue('notificationQueue', {
  connection: redisConnection
});

module.exports = {
  tradeQueue,
  notificationQueue
};
