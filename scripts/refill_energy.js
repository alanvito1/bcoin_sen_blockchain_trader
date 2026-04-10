const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function refill() {
  try {
    const telegramId = 1692505402n;
    await prisma.user.update({
      where: { telegramId },
      data: { credits: 100 }
    });
    console.log('✅ Energy Refilled to 100 for Telegram ID:', telegramId.toString());
  } catch (err) {
    console.error('❌ Error refilling energy:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

refill();
