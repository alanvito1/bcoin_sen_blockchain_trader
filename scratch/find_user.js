const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findUser() {
  try {
    const walletAddress = '0x0543F37d3b8bfE16168d10399a6d9FC64Efdb4Ef';
    const wallet = await prisma.wallet.findFirst({
      where: { publicAddress: { equals: walletAddress, mode: 'insensitive' } },
      include: { user: true }
    });

    if (wallet) {
      console.log('USER_FOUND:');
      console.log(JSON.stringify(wallet.user, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
    } else {
      console.log('USER_NOT_FOUND');
    }
  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

findUser();
