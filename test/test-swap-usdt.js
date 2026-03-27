const config = require('../src/config');
const { swapToken } = require('../src/services/swapper');

async function testUSDT() {
  console.log('--- TESTE DE SWAP PARA USDT (POLYGON) ---');
  
  const bcoin = config.networks.polygon.tokens.find(t => t.symbol === 'BCOIN');
  if (bcoin) {
    console.log('[Polygon] Testando swap de BCOIN para USDT...');
    await swapToken('polygon', bcoin, true);
  }

  const sen = config.networks.polygon.tokens.find(t => t.symbol === 'SEN');
  if (sen) {
    console.log('[Polygon] Testando swap de SEN para USDT...');
    await swapToken('polygon', sen, true);
  }

  console.log('--- FIM DO TESTE ---');
  process.exit(0);
}

testUSDT();
