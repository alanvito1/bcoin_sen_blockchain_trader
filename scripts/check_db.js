const prisma = require('../src/config/prisma');

async function main() {
  console.log('=== ACTIVE TRADE CONFIGS ===');
  const configs = await prisma.tradeConfig.findMany({
    where: { isOperating: true },
    include: { user: { include: { wallet: true } } }
  });
  console.log('Total active:', configs.length);
  configs.forEach(c => {
    console.log(JSON.stringify({
      id: c.id,
      network: c.network,
      pair: c.tokenPair,
      scheduleMode: c.scheduleMode,
      intervalMinutes: c.intervalMinutes,
      strategy30m: c.strategy30m,
      strategy4h: c.strategy4h,
      hasWallet: !!c.user?.wallet,
      userCredits: c.user?.credits,
      subExpires: c.user?.subscriptionExpiresAt
    }, null, 2));
  });

  console.log('\n=== ALL USERS ===');
  const users = await prisma.user.findMany({ include: { wallet: true } });
  users.forEach(u => {
    console.log(JSON.stringify({
      id: u.id,
      telegramId: u.telegramId.toString(),
      isActive: u.isActive,
      credits: u.credits,
      hasWallet: !!u.wallet,
      subscriptionExpiresAt: u.subscriptionExpiresAt
    }));
  });

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
