require('dotenv').config();
const { swapToken } = require('../src/services/swapper');
const config = require('../src/config');

/**
 * FORCE PRODUCTION SHOT
 * Bypasses the strategy engine and executes a minimal real trade
 * to provide the "Fire Test" proof on DexScreener/Explorer.
 */

async function forceShot() {
  console.log("🔥 INICIANDO DISPARO FORÇADO DE PRODUÇÃO (FIRE TEST)\n");

  if (process.env.DRY_RUN === 'true') {
    console.log("🛑 ERRO: DRY_RUN está TRUE no .env. Mude para FALSE para o teste real.");
    process.exit(1);
  }

  const targets = [
    { 
      network: 'bsc', 
      token: config.networks.bsc.tokens.find(t => t.symbol === 'BCOIN'),
      amount: '0.0001' // Minimal BNB worth
    },
    { 
      network: 'polygon', 
      token: config.networks.polygon.tokens.find(t => t.symbol === 'SEN'),
      amount: '0.1' // Minimal POL worth
    }
  ];

  for (const target of targets) {
    console.log(`--- [${target.network.toUpperCase()}] Forçando compra de ${target.token.symbol} ---`);
    try {
      // Calling the PRODUCTION swapToken function with minimal amount
      const result = await swapToken(
        target.network, 
        target.token, 
        'buy', 
        target.amount, 
        'native',
        null // Bypassing market price guard for this forced test
      );

      if (result && result.hash) {
        console.log(`✅ Sucesso! Tx: ${result.hash}`);
      } else {
        console.log(`❌ Falha no disparo para ${target.token.symbol}`);
      }
    } catch (error) {
      console.error(`💥 Erro fatal: ${error.message}`);
    }
    console.log("\n");
  }

  console.log("🏁 Fire Test Concluído.");
  process.exit(0);
}

forceShot();
