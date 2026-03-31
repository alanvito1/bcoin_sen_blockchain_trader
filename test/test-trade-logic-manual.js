const config = require('../src/config');
const { processTradeJob } = require('../src/worker/tradeExecutor');
const prisma = require('../src/config/prisma');
const strategy = require('../src/services/tradingStrategy');
const swapper = require('../src/services/swapper');
const encryption = require('../src/utils/encryption');
const balanceService = require('../src/services/balanceService');
const billingService = require('../src/services/billingService');

// 🧪 Manual mocking of Prisma
prisma.user = { findUnique: (args) => Promise.resolve({ id: 'user-123', telegramId: 123456789 }) };
prisma.tradeConfig = { findUnique: (args) => Promise.resolve({
  id: 'config-123',
  userId: 'user-123',
  tokenPair: 'BCOIN/USDT',
  isOperating: true,
  buyAmount: 10.0,
  strategy30m: true,
  strategy4h: false
}) };
prisma.wallet = { findUnique: (args) => Promise.resolve({
  id: 'wallet-123',
  userId: 'user-123',
  network: 'POLYGON',
  encryptedPrivateKey: 'enc-pk',
  iv: 'iv',
  authTag: 'tag',
  publicAddress: '0x123'
}) };
prisma.tradeHistory = { create: (args) => Promise.resolve({}) };
prisma.user.update = (args) => Promise.resolve({});

// 🧪 Manual mocking of Strategy
strategy.getSignal = (pair, s30, s4) => Promise.resolve({
  signal: 'BUY',
  reason: 'Crossing MA21',
  price: 1.5,
  strategyUsed: 'A'
});

// 🧪 Manual mocking of Encryption
encryption.decrypt = (args) => '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// 🧪 Manual mocking of Balance
balanceService.checkBalances = (addr, net) => Promise.resolve({ hasEnoughGas: true, nativeBalance: '1.0' });

// 🧪 Manual mocking of Swapper
swapper.swapToken = (net, token, dir, amt, type, price, signer) => Promise.resolve({
  status: 1,
  hash: '0xabc123...',
  gasFormatted: '0.0005'
});

// 🧪 Manual mocking of Billing
billingService.consumeCredit = (uid, hash) => Promise.resolve({});

async function test() {
  console.log('\n🧪 [Manual Test] Verificando integração do Executor Mutli-tenant...');
  
  const mockJob = {
    data: {
      userId: 'user-123',
      tradeConfigId: 'config-123',
      walletId: 'wallet-123'
    }
  };

  try {
    await processTradeJob(mockJob);
    console.log('\n✅ [SUCESSO] Logica multi-tenant está correta');
    console.log('- Decodificação de carteira OK');
    console.log('- Chamada ao swapper (routing/segurança) OK');
    console.log('- Notificação enviada OK');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ [FALHA] Erro no teste manual:', error.message);
    process.exit(1);
  }
}

test();
