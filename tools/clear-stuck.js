const { ethers } = require('ethers');
const config = require('../src/config');
const { wallets, providers } = require('../src/services/blockchain');
const explorer = require('../src/utils/explorer');

async function clearStuckTransactions() {
  console.log('--- DEFESA DE REDE: DESBLOQUEADOR DE TRANSAÇÕES (POLYGON) ---');
  
  const network = config.networks.polygon;
  const wallet = wallets.polygon;
  const provider = providers.polygon;

  const nonceLatest = await wallet.getNonce('latest');
  const noncePending = await wallet.getNonce('pending');

  if (noncePending <= nonceLatest) {
    console.log('✅ Tudo limpo! Não há transações pendentes na fila da Polygon.');
    process.exit(0);
  }

  const diff = noncePending - nonceLatest;
  console.log(`⚠️ Detectadas ${diff} transações travadas começando no nonce: ${nonceLatest}`);

  // Get current gas and bump it significantly (Fast * 1.5)
  const gas = await explorer.getPolygonGasPrice();
  if (!gas) {
    console.error('❌ Falha ao obter Gas Price. Tente novamente em alguns segundos.');
    process.exit(1);
  }

  const maxPriorityFeeGwei = (gas.maxPriorityFee * 1.5).toFixed(5);
  const maxFeeGwei = (gas.maxFee * 1.5).toFixed(5);

  console.log(`🚀 Desbloqueando nonce ${nonceLatest} com Gas Agressivo: Priority=${maxPriorityFeeGwei} Gwei, Max=${maxFeeGwei} Gwei...`);

  try {
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      nonce: nonceLatest,
      maxPriorityFeePerGas: ethers.parseUnits(maxPriorityFeeGwei, 'gwei'),
      maxFeePerGas: ethers.parseUnits(maxFeeGwei, 'gwei'),
      gasLimit: 21000
    });

    console.log(`✅ Transação de cancelamento enviada: ${explorer.getExplorerLink('polygon', tx.hash)}`);
    console.log('Aguardando confirmação para liberar a fila...');
    
    await tx.wait();
    console.log('✨ Fila desbloqueada com sucesso! Você já pode rodar o robô novamente.');
    
  } catch (error) {
    console.error('❌ Falha ao desbloquear:', error.message);
  }

  process.exit(0);
}

clearStuckTransactions();
