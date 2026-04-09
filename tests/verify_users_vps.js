const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { wallets: true }
  });
  console.log('--- DATABASE USERS ---');
  users.forEach(u => {
    console.log(`User ID: ${u.id}`);
    console.log(`Telegram ID: ${u.telegramId.toString()}`);
    console.log(`Wallets: ${u.wallets.length}`);
    u.wallets.forEach(w => {
      console.log(`  - ${w.address} (${w.network})`);
    });
    console.log('---------------------');
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
