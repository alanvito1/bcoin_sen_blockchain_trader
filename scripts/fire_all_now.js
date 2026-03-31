const { ethers } = require('ethers');
const prisma = require('../src/config/prisma');
const swapper = require('../src/services/swapper');
const strategy = require('../src/services/tradingStrategy');
const config = require('../src/config');
const logger = require('../src/utils/logger');

/**
 * ONE-SHOT FIRE TEST (REAL MONEY)
 * Executes one real trade for each active strategy immediately.
 */

async function fireAllNow() {
  console.log("🚀 INICIANDO DISPARO REAL (ONE-SHOT) - DINHEIRO REAL DA CONTA\n");

  if (process.env.DRY_RUN === 'true') {
    logger.error("🛑 ERRO: DRY_RUN está 'true' no .env! Mude para 'false' para disparar transações reais.");
    process.exit(1);
  }

  try {
    // 1. Get Active Configs
    const activeConfigs = await prisma.tradeConfig.findMany({
      where: { isOperating: true },
      include: { user: { include: { wallet: true } } }
    });

    if (activeConfigs.length === 0) {
      console.log("⚠️ Nenhuma estratégia ativa encontrada no banco de dados.");
      return;
    }

    console.log(`✅ Encontradas ${activeConfigs.length} estratégias ativas. Iniciando disparos...\n`);

    // 2. Setup Wallet from .env (Master Wallet with Balance)
    const providerPolygon = new ethers.JsonRpcProvider(config.networks.polygon.rpc);
    const providerBsc = new ethers.JsonRpcProvider(config.networks.bsc.rpc);
    
    // We use the PRIVATE_KEY from .env for this test
    const walletP = new ethers.Wallet(process.env.PRIVATE_KEY, providerPolygon);
    const walletB = new ethers.Wallet(process.env.PRIVATE_KEY, providerBsc);

    for (const trade of activeConfigs) {
      const netKey = trade.network.toLowerCase();
      const currentWallet = netKey === 'polygon' ? walletP : walletB;
      
      console.log(`--- [${trade.network}] Par: ${trade.tokenPair} ---`);
      
      // 3. Get Signal (To see what indicators say)
      const signalResult = await strategy.getSignal(trade.tokenPair, trade);
      console.log(`📊 Indicadores: Signal=${signalResult.signal} | Reason=${signalResult.reason}`);

      // 4. Force Execution (Technical Test)
      // We will perform a 0.1 BUY to test the motor "now" as requested.
      const TEST_AMOUNT = 0.1; 
      const direction = 'buy'; 
      
      const tokenSymbol = trade.tokenPair.split('/')[0];
      const tokenConfig = config.networks[netKey].tokens.find(t => t.symbol === tokenSymbol);

      if (!tokenConfig) {
        console.log(`❌ Token ${tokenSymbol} não encontrado na configuração.`);
        continue;
      }

      console.log(`🔫 [FIRE!] Disparando COMPRA de ${TEST_AMOUNT} ${tokenSymbol} na ${trade.network}...`);
      
      const result = await swapper.swapToken(
        netKey,
        tokenConfig,
        direction,
        TEST_AMOUNT,
        'token',
        signalResult.price,
        currentWallet
      );

      if (result && result.status === 1) {
        console.log(`✅ SUCESSO! Tx Hash: ${result.hash}`);
        console.log(`🔗 Explorer: ${config.networks[netKey].explorerUrl}/tx/${result.hash}\n`);
      } else {
        console.log(`❌ FALHA: ${result?.error || 'Erro desconhecido'}\n`);
      }
    }

  } catch (error) {
    console.error("💥 ERRO CRÍTICO NO DISPARO:", error);
  } finally {
    process.exit(0);
  }
}

fireAllNow();
