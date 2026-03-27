const { ethers } = require('ethers');
const config = require('../src/config');
const { providers } = require('../src/services/blockchain');

async function trace(hash) {
  const provider = providers.polygon;
  
  console.log(`--- Analisando Via RPC: ${hash} ---`);
  
  try {
    const tx = await provider.getTransaction(hash);
    if (!tx) {
      console.error('Transação não encontrada!');
      return;
    }

    console.log(`De: ${tx.from}`);
    console.log(`Para: ${tx.to}`);
    console.log(`Valor Native: ${ethers.formatEther(tx.value)} POL`);
    
    // Decode if it's a known router call
    console.log(`Input Data: ${tx.data}`);

    const receipt = await provider.getTransactionReceipt(hash);
    console.log(`\nStatus: ${receipt.status === 1 ? 'Sucesso' : 'Falha'}`);
    console.log(`Gas Usado: ${receipt.gasUsed.toString()}`);
    console.log(`Eventos (Logs): ${receipt.logs.length}`);

    if (receipt.logs.length === 0) {
      console.warn('\n⚠️ ZERO LOGS DETECTADOS! A transação não realizou NENHUMA transferência de token.');
      console.log('Isso explica por que o saldo não mudou.');
    } else {
      for (const log of receipt.logs) {
        console.log(`\nLog em ${log.address}:`);
        console.log(`  Topic0: ${log.topics[0]}`);
        if (log.topics[0] === ethers.id('Transfer(address,address,uint256)')) {
          const from = ethers.getAddress('0x' + log.topics[1].slice(26));
          const to = ethers.getAddress('0x' + log.topics[2].slice(26));
          const value = ethers.toBigInt(log.data);
          console.log(`  ✅ TRANSFERÊNCIA detectada: De ${from} Para ${to} Valor ${value.toString()}`);
        }
      }
    }

  } catch (e) {
    console.error(`Erro: ${e.message}`);
  }
}

const hash = process.argv[2] || '0x3e0e0aaae5561897c271092eaec5430c0db1e13a65227088426d671b1a53f29a';
trace(hash);
