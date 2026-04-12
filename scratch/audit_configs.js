const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const telegramId = '1692505402';
    const user = await prisma.user.findFirst({
      where: { telegramId }
    });

    if (!user) {
      console.log(JSON.stringify({ error: 'User not found' }));
      return;
    }

    const configs = await prisma.tradeConfig.findMany({
      where: { userId: user.id, isOperating: true }
    });

    const report = configs.map(c => ({
      pair: c.tokenPair,
      network: c.network,
      enabled: c.isOperating, // O campo de atividade real é isOperating no schema? Não, enabled não existe no schema, usei no where errado.
      isOperating: c.isOperating,
      maPivot: c.strategy30m ? `${c.timeframeA}(${c.maPeriodA})` : (c.strategy4h ? `${c.timeframeB}(${c.maPeriodB})` : 'N/A'),
      rsi: c.rsiEnabled ? `ON (P:${c.rsiPeriod})` : 'OFF',
      slippage: `${c.slippage}%`,
      gasMode: c.priorityMode || 'Aggressive', // mapeado de priorityMode
      buyAmount: c.buyAmountA, // BCOIN/SEN principal
      sellAmount: c.sellAmountA,
      window1: `${c.window1Min}-${c.window1Max}m`,
      window2: `${c.window2Min}-${c.window2Max}m`,
      dryRun: c.dryRun
    }));

    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
