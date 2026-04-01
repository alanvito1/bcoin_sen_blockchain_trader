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

  console.log('\n=== MARKET DATA (PriceTick) ===');
  const ticks = await prisma.priceTick.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10
  });
  console.log(`Total Ticks In DB: ${await prisma.priceTick.count()}`);
  ticks.forEach(t => {
    console.log(`[${t.timestamp.toISOString()}] ${t.symbol} on ${t.network}: $${t.price.toFixed(6)}`);
  });

  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
