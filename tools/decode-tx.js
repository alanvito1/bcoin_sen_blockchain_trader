const { ethers } = require('ethers');
const config = require('../src/config');
const { providers } = require('../src/services/blockchain');

const ROUTER_ABI = [
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external'
];

async function decodeTx(hash) {
  const provider = providers.polygon;
  const iface = new ethers.Interface(ROUTER_ABI);

  try {
    const tx = await provider.getTransaction(hash);
    console.log(`--- Decodificando Tx: ${hash} ---`);
    console.log(`To: ${tx.to}`);
    
    try {
      const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
      console.log(`\nFunção: ${decoded.name}`);
      console.log(`amountIn: ${decoded.args.amountIn.toString()}`);
      console.log(`amountOutMin: ${decoded.args.amountOutMin.toString()}`);
      console.log(`path: ${decoded.args.path.join(' -> ')}`);
      console.log(`to: ${decoded.args.to}`);
      console.log(`deadline: ${decoded.args.deadline.toString()}`);
    } catch (e) {
      console.error(`❌ Erro ao decodificar: ${e.message}`);
      console.log(`Input raw Data: ${tx.data}`);
    }
    
  } catch (e) {
    console.error(`Erro: ${e.message}`);
  }
}

const hash = process.argv[2] || '0x3e0e0aaae5561897c271092eaec5430c0db1e13a65227088426d671b1a53f29a';
decodeTx(hash);
