const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addCredits() {
  const walletAddr = '0x0543F37d3b8bfE16168d10399a6d9FC64Efdb4Ef';
  try {
    const wallet = await prisma.wallet.findFirst({
      where: { publicAddress: { equals: walletAddr, mode: 'insensitive' } },
      include: { user: true }
    });

    if (!wallet) {
      console.log('WALLET_NOT_FOUND');
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: wallet.userId },
      data: { credits: { increment: 100 } }
    });

    console.log(`SUCCESS: Adicionados 100 créditos para o usuário ${updatedUser.telegramId || updatedUser.id}. Novo saldo: ${updatedUser.credits}`);
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addCredits();
