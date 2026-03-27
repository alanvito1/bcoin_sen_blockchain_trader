const explorer = require('../src/utils/explorer');
const config = require('../src/config');

async function test() {
  console.log('--- TESTE DE INTEGRAÇÃO COM EXPLORER ---');
  
  // Test 1: Links
  console.log('\n1. Testando links de transação:');
  const dummyHash = '0x1234567890123456789012345678901234567890123456789012345678901234';
  console.log(`BSC Link: ${explorer.getExplorerLink('bsc', dummyHash)}`);
  console.log(`Polygon Link: ${explorer.getExplorerLink('polygon', dummyHash)}`);

  // Test 2: Polygon Gas
  console.log('\n2. Testando busca de Gas na Polygon (Gas Station):');
  const gas = await explorer.getPolygonGasPrice();
  if (gas) {
    console.log('✅ Sucesso ao obter Gas da Polygon:');
    console.log(`   Max Fee: ${gas.maxFee} Gwei`);
    console.log(`   Priority Fee: ${gas.maxPriorityFee} Gwei`);
  } else {
    console.warn('⚠️ Falha ao obter Gas da Polygon (pode ser instabilidade temporária API).');
  }

  // Test 3: Transaction Status (Dummy wait)
  console.log('\n3. Verificando logs da API (API keys ausentes são esperadas agora):');
  const status = await explorer.getTransactionStatus('bsc', dummyHash);
  if (status === null) {
    console.log('ℹ️ Status retornado como null (esperado se BSCSCAN_API_KEY não estiver no .env)');
  } else {
    console.log(`Status status: ${status}`);
  }

  console.log('\n--- FIM DO TESTE ---');
}

test();
