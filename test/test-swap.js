const config = require('../src/config');
const { swapToken } = require('../src/services/swapper');

async function testAll() {
  console.log('--- TESTE DE SWAP MANUAL ---');
  console.log('Tentando vender 1 unidade de cada token (se houver saldo)...');

  // BSC
  for (const token of config.networks.bsc.tokens) {
    console.log(`[BSC] Testando ${token.symbol}...`);
    await swapToken('bsc', token);
  }

  // Polygon
  for (const token of config.networks.polygon.tokens) {
    console.log(`[Polygon] Testando ${token.symbol}...`);
    await swapToken('polygon', token);
  }

  console.log('--- FIM DO TESTE ---');
  process.exit(0);
}

testAll();
