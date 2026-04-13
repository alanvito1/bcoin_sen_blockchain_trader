const { processTradeJob } = require('../worker/tradeExecutor');
const prisma = require('../config/prisma');

async function test() {
  const userId = '243b72cd-69fc-465f-8196-09ad9391cb6c';
  const config = await prisma.tradeConfig.findFirst({ where: { userId } });
  
  if (!config) return console.log('Config not found');
  
  console.log('--- STARTING SANITY TEST ---');
  console.log(`User ID: ${userId}`);
  console.log(`Token Pair: ${config.tokenPair}`);
  console.log(`Expected Behavior: Fail with 'BCOIN saldo insuficiente' (Labels should be fixed)`);
  
  const mockJob = {
    id: 'test-sanity-' + Date.now(),
    data: {
      userId,
      tradeConfigId: config.id,
      walletId: null,
      isFirstAttempt: true,
      forceSignal: 'SELL',
      forceAmount: 1
    }
  };

  try {
    const result = await processTradeJob(mockJob);
    console.log('Job Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.log('Job Caught Error:', e.message);
  } finally {
    console.log('--- END OF SANITY TEST ---');
    process.exit(0);
  }
}

test();
