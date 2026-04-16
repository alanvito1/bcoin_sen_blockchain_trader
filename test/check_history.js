const prisma = require('../src/config/prisma');
async function run() {
    const history = await prisma.tradeHistory.findMany({
        where: { txHash: { not: { startsWith: 'DRY_RUN' } } },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    console.log(JSON.stringify(history, null, 2));
    process.exit(0);
}
run().catch(console.error);
