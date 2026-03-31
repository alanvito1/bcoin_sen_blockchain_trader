const balanceService = require('../src/services/balanceService');
require('dotenv').config();

async function test() {
  const testAddress = '0x000000000000000000000000000000000000dEaD'; // Burn address for testing
  console.log('--- Testando consulta de saldos multi-rede ---');
  console.log('Endereço:', testAddress);

  try {
    const balances = await balanceService.getMultiChainBalances(testAddress);
    console.log('\nResultados:');
    console.log(JSON.stringify(balances, null, 2));
    
    if (balances.polygon && balances.bsc) {
      console.log('\n✅ Sucesso! Ambas as redes foram consultadas.');
    } else {
      console.log('\n⚠️ Atenção: Uma ou mais redes falharam.');
    }
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

test();
