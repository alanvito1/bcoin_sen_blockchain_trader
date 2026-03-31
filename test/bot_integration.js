// BigInt toJSON for Prisma Serializaliton
BigInt.prototype.toJSON = function() { return this.toString(); };

const { Wallet, JsonRpcProvider } = require('ethers');
const prisma = require('../src/config/prisma');
const config = require('../src/config');
const walletHandler = require('../src/bot/features/wallet');
const storeHandler = require('../src/bot/features/store');
require('dotenv').config({ path: '.env.local' });

async function checkInfrastructure() {
  console.log('📡 [Diagnostic] Checking core infrastructure...');
  
  // 1. DB Check
  try {
    await prisma.$connect();
    console.log('   ✅ Database: Connected (Port 5433)');
  } catch (err) {
    console.error(`   ❌ Database: FAILED. Ensure docker-compose is running and port 5433 is open.`);
    throw err;
  }

  // 2. RPC Check
  const networks = ['polygon', 'bsc'];
  for (const net of networks) {
    const rpcUrl = config.networks[net].rpc;
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const block = await provider.getBlockNumber();
      console.log(`   ✅ RPC ${net.toUpperCase()}: Connected! (${rpcUrl.slice(0, 20)}...) Block: ${block}`);
    } catch (err) {
      console.warn(`   ⚠️  RPC ${net.toUpperCase()}: UNAVAILABLE. Check your config.`);
    }
  }
}

async function runIntegrationTest() {
  console.log('🚀 [Integration Test] Initializing full bot simulation...');
  console.log('---------------------------------------------------------');

  try {
    await checkInfrastructure();

    const mockUserId = 999999999;
    const ctx = {
      from: { id: mockUserId, first_name: 'Tester', username: 'test_user' },
      answerCbQuery: async (text) => console.log(`   🔸 [Callback]: ${text}`),
      editMessageText: async (text) => console.log(`   🔹 [UI]: ${text.replace(/<[^>]*>/g, '').slice(0, 60)}...`),
      replyWithHTML: async (text) => console.log(`   🔹 [Reply]: ${text.replace(/<[^>]*>/g, '').slice(0, 60)}...`),
      reply: async (text) => console.log(`   🔹 [Reply]: ${text}`)
    };

    console.log('\n👤 [Step 1] Creating/Resetting Test User...');
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(mockUserId) },
      update: { username: 'test_user', hasAcceptedTerms: true },
      create: { telegramId: BigInt(mockUserId), username: 'test_user', hasAcceptedTerms: true }
    });

    console.log('💳 [Step 2] Testing Wallet Generation (Live RPC)...');
    await walletHandler.generateWalletHandler(ctx);

    console.log('🔋 [Step 3] Testing Pricing Engine (Live Pools)...');
    await storeHandler.confirmCheckoutHandler(ctx, 'p1', 'BCOIN');

    console.log('---------------------------------------------------------');
    console.log('✅ [SUCCESS] All bot systems are stable and responsive!');

  } catch (error) {
    console.error('---------------------------------------------------------');
    console.error('❌ [TEST FAILED]', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runIntegrationTest();


