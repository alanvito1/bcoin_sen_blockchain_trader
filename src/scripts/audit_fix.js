
const { JsonRpcProvider } = require('ethers');
const prisma = require('../config/prisma');
const redis = require('../config/redis');
const config = require('../config');
const { providers } = require('../services/blockchain');
const logger = require('../utils/logger');

async function audit() {
  console.log('\n🔍 [AUDIT-DEFINITIVO] Iniciando Auditoria Técnica de Precisão...\n');
  console.log('---------------------------------------------------------');

  try {
    // 1. Database Check
    console.log('📦 [1/4] Banco de Dados:');
    try {
      await prisma.$connect();
      const userCount = await prisma.user.count();
      console.log(`   ✅ Conectado com sucesso. (${userCount} usuários registrados)`);
    } catch (err) {
      console.error(`   ❌ ERRO no Banco de Dados: ${err.message}`);
    }

    // 2. Redis Check
    console.log('\n🚀 [2/4] Fila & Cache (Redis):');
    try {
      const ping = await redis.ping();
      console.log(`   ✅ Redis Respondendo: ${ping}`);
    } catch (err) {
      console.error(`   ❌ ERRO no Redis: ${err.message}`);
    }

    // 3. User & Wallet Audit
    console.log('\n👤 [3/4] Auditoria de Usuário & Carteira:');
    const adminId = '1692505402';
    const user = await prisma.user.findFirst({
        where: { telegramId: adminId },
        include: { wallet: true, tradeConfigs: true }
    });

    if (user) {
        console.log(`   ✅ Admin Encontrado: ${user.username} (Credits: ${user.credits})`);
        if (user.wallet) {
            console.log(`   ✅ Carteira Principal: ${user.wallet.publicAddress}`);
        } else {
            console.error('   ❌ CRÍTICO: Usuário não possui carteira vinculada! (Foi deletada pelo hardening?)');
            console.warn('      Ação Necessária: O usuário deve gerar uma nova carteira no bot (/wallet).');
        }
    } else {
        console.error('   ❌ ERRO: Admin não encontrado no Banco de Dados!');
    }

    // 4. RPC Infrastructure (Using Resilient Providers)
    console.log('\n📡 [4/4] Infraestrutura Blockchain (Resilient RPC):');
    const nets = ['bsc', 'polygon'];
    for (const net of nets) {
      try {
        const provider = providers[net];
        const block = await provider.getBlockNumber();
        console.log(`   ✅ ${net.toUpperCase()}: Block ${block} [PROVIDER OK]`);
      } catch (err) {
        console.error(`   ❌ ${net.toUpperCase()}: PROVIDER falhou! Erro: ${err.message}`);
      }
    }

    console.log('\n---------------------------------------------------------');
    console.log('🏁 Auditoria Finalizada com Sucesso.');

  } catch (globalErr) {
    console.error(`\n💥 ERRO FATAL NA AUDITORIA: ${globalErr.message}`);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

audit();
