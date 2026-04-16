const prisma = require('../src/config/prisma');

async function recharge() {
    console.log('⚡ Preparing user for stress test...');
    const u = await prisma.user.findFirst();
    if (!u) {
        console.error('❌ No user found.');
        process.exit(1);
    }
    
    await prisma.user.update({
        where: { id: u.id },
        data: { 
            credits: 10000,
            notifyTrades: false,
            notifySteps: false,
            notifyBalances: false
        }
    });

    await prisma.tradeConfig.updateMany({
        where: { userId: u.id },
        data: { 
            isOperating: true, 
            dryRun: true 
        }
    });

    console.log(`✅ User ${u.id} recharged with 10k Energy and ready for stress test.`);
    process.exit(0);
}

recharge().catch(console.error);
