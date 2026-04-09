const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding production database for Stress Test...');

    // 1. Check if user exists, else create
    let user = await prisma.user.findFirst();
    if (!user) {
        user = await prisma.user.create({
            data: {
                id: '123456789',
                username: 'stress_test_user',
                firstName: 'Stress',
                lastName: 'Test',
                xp: 0,
                level: 1
            }
        });
        console.log('✅ Created dummy user.');
    }

    // 2. Check if wallet exists for this user, else create
    let wallet = await prisma.wallet.findFirst({
        where: { userId: user.id }
    });
    
    if (!wallet) {
        wallet = await prisma.wallet.create({
            data: {
                userId: user.id,
                address: '0x0000000000000000000000000000000000000000',
                encryptedPrivateKey: 'dummy',
                isDefault: true,
                balance: '0'
            }
        });
        console.log('✅ Created dummy wallet.');
    }

    // 3. Create/Update TradeConfig
    let config = await prisma.tradeConfig.findFirst({
        where: { userId: user.id }
    });

    if (!config) {
        config = await prisma.tradeConfig.create({
            data: {
                userId: user.id,
                tokenPair: 'BCOIN/USDT',
                network: 'BSC',
                isOperating: true,
                dryRun: true,
                slippage: 1.0,
                buyAmount: '1.0',
                sellAmount: '1.0',
                intervalMinutes: 1
            }
        });
        console.log('✅ Created dummy TradeConfig.');
    } else {
        await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { isOperating: true, dryRun: true }
        });
        console.log('✅ Updated existing TradeConfig to DryRun mode.');
    }

    console.log('✨ Seed complete!');
}

seed()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
