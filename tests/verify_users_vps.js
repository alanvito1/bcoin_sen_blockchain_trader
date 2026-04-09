const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { wallet: true }
  });
  console.log('--- DATABASE USERS ---');
  users.forEach(u => {
    console.log(`User ID: ${u.id}`);
    console.log(`Telegram ID: ${u.telegramId.toString()}`);
    console.log(`Wallet: ${u.wallet ? u.wallet.publicAddress : 'No Wallet'}`);
    console.log('---------------------');
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
