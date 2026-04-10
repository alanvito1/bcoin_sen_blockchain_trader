const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const telegramId = 1692505402n;
    const user = await prisma.user.findUnique({
        where: { telegramId },
        include: { tradeConfigs: true }
    });

    if (!user) {
        console.error('User not found');
        process.exit(1);
    }

    console.log('--- USER INFO ---');
    console.log(`ID: ${user.id}`);
    console.log(`TelegramID: ${user.telegramId}`);

    console.log('\n--- TRADE CONFIGS ---');
    user.tradeConfigs.forEach(conf => {
        console.log(`[${conf.network}] ${conf.tokenPair}: ID=${conf.id}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
