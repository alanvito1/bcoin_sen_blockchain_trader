const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const targetWallet = '0x0543F37d3b8bfE16168d10399a6d9FC64Efdb4Ef';
  try {
    const wallet = await prisma.wallet.findFirst({
      where: { publicAddress: { equals: targetWallet, mode: 'insensitive' } }
    });

    if (!wallet) {
      console.log('WALLET_NOT_FOUND');
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { id: wallet.userId },
      data: { credits: { increment: 100 } }
    });

    console.log(`SUCCESS: Credits added. New balance: ${updated.credits}`);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
