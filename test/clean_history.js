const prisma = require('../src/config/prisma');

async function clean() {
    const res = await prisma.tradeHistory.deleteMany({
        where: { txHash: { startsWith: 'DRY_RUN' } }
    });
    console.log('Cleaned Dry Runs:', res.count);
    process.exit(0);
}

clean().catch(console.error);
