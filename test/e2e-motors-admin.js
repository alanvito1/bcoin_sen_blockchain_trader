const prisma = require('../src/config/prisma');
const { tradeQueue } = require('../src/config/queue');
const logger = require('../src/utils/logger');

async function validationE2E() {
  const telegramId = '1692505402'; // ADMIN FOUNDER
  console.log(`\n🚨 INICIANDO VALIDAÇÃO E2E (TEST-DRIVEN): USUÁRIO ${telegramId}\n`);

  try {
    const user = await prisma.user.findFirst({
      where: { telegramId: telegramId },
      include: { wallet: true, tradeConfigs: true }
    });

    if (!user || !user.wallet) {
      throw new Error('Usuário Admin ou Carteira não encontrados.');
    }

    const motors = [
      { network: 'BSC', token: 'BCOIN', pair: 'BCOIN/USDT' },
      { network: 'BSC', token: 'SEN', pair: 'SEN/USDT' },
      { network: 'POLYGON', token: 'BCOIN', pair: 'BCOIN/USDT' },
      { network: 'POLYGON', token: 'SEN', pair: 'SEN/USDT' }
    ];

    console.log(`✅ Admin Localizado: ${user.username} (ID: ${user.id})`);
    console.log(`💼 Carteira: ${user.wallet.publicAddress}\n`);

    for (const motor of motors) {
      console.log(`⚙️  Preparando Motor: ${motor.network} - ${motor.token}...`);

      // Upsert configuration for the motor
      let config = user.tradeConfigs.find(c => 
        c.network === motor.network && 
        c.tokenPair === motor.pair
      );

      if (!config) {
        config = await prisma.tradeConfig.create({
          data: {
            userId: user.id,
            network: motor.network,
            tokenPair: motor.pair,
            buyAmountA: 0.1,
            sellAmountA: 0.1,
            isOperating: true,
            dryRun: false // LIVE MODE!
          }
        });
        console.log(`   [NEW] Configuração criada (ID: ${config.id})`);
      } else {
        config = await prisma.tradeConfig.update({
          where: { id: config.id },
          data: { isOperating: true, dryRun: false } // LIVE MODE!
        });
        console.log(`   [UPD] Configuração ativada (ID: ${config.id})`);
      }

      // Add test job to queue with force signal
      const job = await tradeQueue.add('executeTrade', {
        userId: user.id,
        tradeConfigId: config.id,
        walletId: user.wallet.id,
        forceSignal: 'BUY',
        forcePrice: 0.05,
        forceAmount: 100.0, // 100.0 BCOIN/SEN (Approx 0.7 USDT/ 15 USDT)
        forceStrategy: 'VALIDATION_E2E',
        isFirstAttempt: true
      });

      console.log(`   🚀 JOB ENFILEIRADO: ID ${job.id}`);
    }

    console.log('\n📊 Todos os 4 motores foram enfileirados. Aguardando processamento...\n');
    await new Promise(r => setTimeout(r, 8000));

    const history = await prisma.tradeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 4
    });

    console.log('--- RESULTADOS DO HISTÓRICO RECENTE ---');
    history.forEach(h => {
      const statusIcon = h.status === 'SUCCESS' ? '✅' : '❌';
      console.log(`${statusIcon} [${h.createdAt.toISOString()}] ${h.type} | Status: ${h.status} | Tx: ${h.txHash.slice(0, 16)}...`);
      if (h.errorMessage) {
        console.log(`   ⚠️ Erro: ${h.errorMessage}`);
      }
    });

    console.log('\n🏁 Validação Finalizada. Verifique os logs do Docker para detalhes técnicos.');
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ FALHA NA VALIDAÇÃO: ${error.message}`);
    process.exit(1);
  }
}

validationE2E();
