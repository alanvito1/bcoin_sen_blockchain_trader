const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verify() {
  console.log("--- AUDIT: USERS & WALLETS ---");
  const users = await prisma.user.findMany({
    include: { wallet: true }
  });

  const report = users.map(u => ({
    id: u.id,
    telegramId: u.telegramId.toString(),
    username: u.username,
    hasWallet: !!u.wallet,
    address: u.wallet ? u.wallet.publicAddress : null
  }));

  console.log(JSON.stringify(report, null, 2));
}

verify()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
