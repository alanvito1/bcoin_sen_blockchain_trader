const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { tradeQueue } = require('../config/queue');
const prisma = require('../config/prisma');
const logger = require('../utils/logger');

/**
 * POWER BLAST: Simula o disparo sincronizado de todos os motores operantes
 * usando parâmetros REAIS de compra e saldo da carteira.
 */
async function powerBlast() {
  const userId = 'a36b9d3d-6760-44c1-866c-2eb0318c8f76';
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        tradeConfigs: {
          where: { isOperating: true }
        },
        wallet: true
      }
    });

    if (!user) {
      console.error('❌ Usuário não encontrado.');
      process.exit(1);
    }

    if (user.tradeConfigs.length === 0) {
      console.warn('⚠️ Nenhum motor está ATIVO (isOperating: true) para este usuário.');
      process.exit(0);
    }

    if (!user.wallet) {
      console.error('❌ Carteira não vinculada ao usuário.');
      process.exit(1);
    }

    console.log(`\n💥 INICIANDO POWER BLAST: ${user.tradeConfigs.length} motores ativos...\n`);

    for (const config of user.tradeConfigs) {
      // Injetamos na fila de produção respeitando a concorrência do servidor
      await tradeQueue.add('executeTrade', {
        userId: user.id,
        tradeConfigId: config.id,
        walletId: user.wallet.id,
        forceSignal: 'BUY', // Forçamos o sinal para simular a janela de oportunidade
        isFirstAttempt: true
      }, {
        removeOnComplete: true,
        attempts: 1 
      });

      console.log(`✅ [${config.network}] Enfileirado: ${config.tokenPair} (Usando Params Reais)`);
    }

    console.log('\n🌟 Todos os motores foram enfileirados com sucesso.');
    console.log('Acompanhe a execução tática nos logs e no Telegram.\n');
    
    setTimeout(() => process.exit(0), 1500);

  } catch (error) {
    console.error('❌ Falha no Power Blast:', error.message);
    process.exit(1);
  }
}

powerBlast();
