const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { tradeQueue } = require('../config/queue');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

async function testFire() {
  const userId = 'a36b9d3d-6760-44c1-866c-2eb0318c8f76';
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        tradeConfigs: true,
        wallet: true
      }
    });

    if (!user || user.tradeConfigs.length === 0) {
      console.error('❌ Usuário não encontrado ou sem motores configurados.');
      process.exit(1);
    }

    console.log(`\n🚀 Iniciando DISPARO DE TESTE para ${user.tradeConfigs.length} motores...\n`);

    for (const config of user.tradeConfigs) {
      if (!user.wallet) {
          console.warn(`⚠️ Pulando ${config.network} - ${config.tokenPair}: Carteira não encontrada.`);
          continue;
      }

      await tradeQueue.add('executeTrade', {
        userId: user.id,
        tradeConfigId: config.id,
        walletId: user.wallet.id,
        forceSignal: 'BUY',
        isFirstAttempt: true
      }, {
        removeOnComplete: true,
        attempts: 1 // Teste único
      });

      console.log(`✅ [${config.network}] Disparo enviado para ${config.tokenPair}`);
    }

    console.log('\n🌟 Todos os comandos de compra foram injetados na fila de execução.');
    console.log('Acompanhe as notificações no Telegram e os logs do docker-compose.\n');
    
    // Pequeno delay para garantir que o BullMQ processou o envio antes de fechar
    setTimeout(() => process.exit(0), 2000);

  } catch (error) {
    console.error('❌ Falha ao disparar motores:', error.message);
    process.exit(1);
  }
}

testFire();
