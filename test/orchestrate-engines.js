const prisma = require('../src/config/prisma');
const { tradeQueue } = require('../src/config/queue');
const fs = require('fs');

async function orchestrateTest() {
  const summary = {
    timestamp: new Date().toISOString(),
    user: null,
    engines: [],
    errors: []
  };

  console.log('🚀 Iniciando Orquestração de Teste Multi-Engine (Robust Mode)...');

  try {
    // 1. Encontrar o primeiro usuário com carteira
    const user = await prisma.user.findFirst({
      where: { wallet: { isNot: null } },
      include: { wallet: true, tradeConfigs: true }
    });

    if (!user) {
      throw new Error('Nenhum usuário com carteira encontrado no banco de dados.');
    }

    summary.user = { username: user.username, id: user.id, address: user.wallet.publicAddress };
    console.log(`👤 Usuário: ${user.username} (${user.id})`);

    const enginePairs = [
      { network: 'BSC', token: 'BCOIN' },
      { network: 'BSC', token: 'SEN' },
      { network: 'POLYGON', token: 'BCOIN' },
      { network: 'POLYGON', token: 'SEN' }
    ];

    for (const engine of enginePairs) {
      try {
        console.log(`\n⚙️  Processando: ${engine.network} - ${engine.token}...`);

        let config = user.tradeConfigs.find(c => 
          c.network === engine.network && 
          c.tokenPair.startsWith(engine.token)
        );

        if (!config) {
          console.log(`➕ Criando configuração para ${engine.network}...`);
          config = await prisma.tradeConfig.create({
            data: {
              userId: user.id,
              network: engine.network,
              tokenPair: `${engine.token}/USDT`,
              buyAmountA: 0.1,
              sellAmountA: 0.1,
              isOperating: true
            }
          });
        } else {
          console.log(`✅ Atualizando configuração existente (ID: ${config.id})...`);
          config = await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { isOperating: true, buyAmountA: 0.1, sellAmountA: 0.1 }
          });
        }

        const job = await tradeQueue.add('executeTrade', {
          userId: user.id,
          tradeConfigId: config.id,
          walletId: user.wallet.id
        }, { removeOnComplete: true, attempts: 1 });

        console.log(`🚀 Job enfileirado: ID ${job.id}`);
        summary.engines.push({ network: engine.network, token: engine.token, jobId: job.id, status: 'QUEUED' });

      } catch (err) {
        console.error(`❌ Erro no motor ${engine.network}-${engine.token}:`, err.message);
        summary.errors.push({ engine: `${engine.network}-${engine.token}`, error: err.message });
      }
    }

    // 2. Extrair pequena amostra do histórico para validar se os workers pegaram
    console.log('\n📊 Aguardando 5 segundos para processamento inicial...');
    await new Promise(r => setTimeout(r, 5000));

    const history = await prisma.tradeHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    summary.recentHistory = history;
    
    fs.writeFileSync('./test/test-results.json', JSON.stringify(summary, null, 2));
    console.log('\n✅ Teste orquestrado finalizado. Resultados salvos em test/test-results.json');
    process.exit(0);

  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error.message);
    fs.writeFileSync('./test/test-results.json', JSON.stringify({ error: error.message }, null, 2));
    process.exit(1);
  }
}

orchestrateTest();
