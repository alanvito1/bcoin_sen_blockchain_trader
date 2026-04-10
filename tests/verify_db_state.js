const prisma = require('../src/config/prisma');

async function verify() {
    const u = await prisma.user.findFirst();
    const configs = await prisma.tradeConfig.findMany({ where: { userId: u.id } });
    
    console.log('--- DB STATE ---');
    console.log('User Credits:', u.credits);
    console.log('User Notifications:', {
        trades: u.notifyTrades,
        steps: u.notifySteps,
        balances: u.notifyBalances
    });
    console.log('Active Configs:', configs.filter(c => c.isOperating).length);
    console.log('Configs:', configs.map(c => ({ pair: c.tokenPair, op: c.isOperating, dry: c.dryRun })));
    
    process.exit(0);
}

verify().catch(console.error);
