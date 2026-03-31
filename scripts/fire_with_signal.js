const { ethers } = require('ethers');
const prisma = require('../src/config/prisma');
const swapper = require('../src/services/swapper');
const strategy = require('../src/services/tradingStrategy');
const config = require('../src/config');
const logger = require('../src/utils/logger');

async function fireWithSignal() {
  console.log("🔍 PROVA TÉCNICA: MOTOR EM BUSCA DE SINAL REAL\n");

  if (process.env.DRY_RUN === 'true') {
    console.log("🛑 MODO SIMULAÇÃO ATIVO. Mude DRY_RUN para false para disparar.");
    return;
  }

  try {
    const activeConfigs = await prisma.tradeConfig.findMany({
      where: { isOperating: true },
      include: { user: { include: { wallet: true } } }
    });

    const providerPolygon = new ethers.JsonRpcProvider(config.networks.polygon.rpc);
    const providerBsc = new ethers.JsonRpcProvider(config.networks.bsc.rpc);
    
    const walletP = new ethers.Wallet(process.env.PRIVATE_KEY, providerPolygon);
    const walletB = new ethers.Wallet(process.env.PRIVATE_KEY, providerBsc);

    for (const trade of activeConfigs) {
      console.log(`--- [${trade.network}] Par: ${trade.tokenPair} ---`);
      
      // Delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));

      const signalResult = await strategy.getSignal(trade.tokenPair, trade);
      console.log(`📊 Indicadores: Signal=${signalResult.signal} | Reason=${signalResult.reason}`);

      if (signalResult.signal === 'HOLD') {
        console.log(`⏸️  MERCADO EM HOLD: Nenhuma ordem gerada (Respeitando a estratégia).`);
        continue;
      }

      // If we ARE in BUY or SELL:
      const netKey = trade.network.toLowerCase();
      const currentWallet = netKey === 'polygon' ? walletP : walletB;
      const amount = signalResult.signal === 'BUY' ? trade.buyAmountA : trade.sellAmountA;
      
      const tokenSymbol = trade.tokenPair.split('/')[0];
      const tokenConfig = config.networks[netKey].tokens.find(t => t.symbol === tokenSymbol);

      console.log(`🚀 [GATILHO!] SINAL DE ${signalResult.signal} DETECTADO. DISPARANDO ${amount} ${tokenSymbol}...`);
      
      const result = await swapper.swapToken(
        netKey,
        tokenConfig,
        signalResult.signal.toLowerCase(),
        amount,
        'token',
        signalResult.price,
        currentWallet
      );

      if (result && result.status === 1) {
        console.log(`✅ DISPARADO COM SUCESSO! Tx Hash: ${result.hash}`);
        console.log(`🔗 Explorer: ${config.networks[netKey].explorerUrl}/tx/${result.hash}`);
      } else {
        console.log(`❌ FALHA NO DISPARO: ${result?.error || 'Erro na Blockchain'}`);
      }
    }

  } catch (error) {
    console.error("💥 ERRO NO MOTOR DE PROVA:", error.message);
  } finally {
    console.log("\n🏁 ANÁLISE CONCLUÍDA.");
    process.exit(0);
  }
}

fireWithSignal();
