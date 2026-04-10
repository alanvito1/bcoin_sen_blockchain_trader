const Redis = require('../src/config/redis');
const { Queue } = require('bullmq');

async function getCounts() {
    const q = new Queue('tradeQueue', { connection: Redis });
    const counts = await q.getJobCounts();
    console.log('Job counts:', counts);
    process.exit(0);
}

getCounts().catch(console.error);
