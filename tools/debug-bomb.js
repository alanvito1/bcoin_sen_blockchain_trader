const { ethers } = require('ethers');
const config = require('../src/config');
const { wallets, providers } = require('../src/services/blockchain');

async function debugLastTx() {
  const provider = providers.polygon;
  const wallet = wallets.polygon;
  
  console.log(`Buscando transações recentes de: ${wallet.address}...`);
  // Just get the last few txs for the wallet on Polygon
  // Or run a dummy swap of 0.01 BCOIN to get the tx hash directly and trace it.
  
}
debugLastTx();
