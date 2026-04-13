const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const configs = await prisma.tradeConfig.findMany({
      where: { isOperating: true },
      include: {
        user: {
          select: { 
            id: true, 
            telegramId: true, 
            credits: true, 
            isActive: true, 
            notifySteps: true,
            subscriptionExpiresAt: true
          }
        }
      }
    });

    console.log(JSON.stringify(configs, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value, 2));

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
