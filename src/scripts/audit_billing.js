const prisma = require('../config/prisma');

async function audit() {
  try {
    console.log('--- AUDIT START ---');
    const users = await prisma.user.findMany({
      where: { credits: 100 },
      include: { tradeConfigs: true }
    });

    if (users.length === 0) {
      console.log('No user found with exactly 100 credits.');
    } else {
      for (const u of users) {
        console.log(`User Found: ${u.telegramId} | ID: ${u.id}`);
        console.log(`Credits: ${u.credits}`);
        console.log(`Sub Expires: ${u.subscriptionExpiresAt}`);
        
        const history = await prisma.tradeHistory.findMany({
          where: { userId: u.id },
          take: 10,
          orderBy: { createdAt: 'desc' }
        });
        
        console.log(`Last 10 Trades status:`, history.map(h => `${h.type}: ${h.status} [${h.errorMessage || 'N/A'}] (${h.txHash.substring(0,10)}...)`).join(' | '));
      }
    }
    console.log('--- AUDIT END ---');
  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    process.exit();
  }
}

audit();
