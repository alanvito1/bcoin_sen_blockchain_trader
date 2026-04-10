const Redis = require('../src/config/redis');
const { Queue } = require('bullmq');

async function cleanup() {
    console.log('🧹 Draining tradeQueue...');
    const q = new Queue('tradeQueue', { connection: Redis });
    await q.drain();
    console.log('✅ Queue drained.');
    process.exit(0);
}

cleanup().catch(err => {
    console.error(err);
    process.exit(1);
});
