const { processTradeJob } = require('../src/worker/tradeExecutor');
const prisma = require('../src/config/prisma');
require('dotenv').config();

/**
 * TRIGGER REAL PRODUCTION ENGINE
 * This script uses the EXACT same function that the BullMQ worker uses.
 * It bypasses the queue and triggers the execution logic immediately for active configs.
 */

async function triggerEngine() {
  console.log("🚀 DISPARANDO MOTOR DE PRODUÇÃO ORIGINAL (PROVA TÉCNICA)\n");

  if (process.env.DRY_RUN === 'true') {
    console.log("🛑 MODO SIMULAÇÃO (DRY_RUN) ATIVO no .env. Mude para false para execução real.");
  } else {
    console.log("🔥 MODO REAL ATIVO. O motor disparará transações se houver sinal.");
  }

  try {
    // 1. Get all operating configs
    const activeConfigs = await prisma.tradeConfig.findMany({
      where: { isOperating: true },
      include: { user: { include: { wallet: true } } }
    });

    if (activeConfigs.length === 0) {
      console.log("⚠️ Nenhuma estratégia ativa no banco de dados. (Execute scripts/seed_production_user.js primeiro)");
      return;
    }

    console.log(`✅ ${activeConfigs.length} estratégias ativas encontradas. Chamando processTradeJob...\n`);

    for (const config of activeConfigs) {
      console.log(`--- [${config.network}] Executando motor para: ${config.tokenPair} ---`);
      
      // We pass a mock "job" object to the real production function
      const mockJob = {
        data: {
          userId: config.userId,
          tradeConfigId: config.id,
          walletId: config.user.wallet.id
        }
      };

      // CALLING THE REAL PRODUCTION CODE
      await processTradeJob(mockJob);
    }

  } catch (error) {
    console.error("💥 Erro ao disparar o motor:", error.message);
  } finally {
    process.exit(0);
  }
}

triggerEngine();
