const { ethers } = require('ethers');
const config = require('../src/config');
const { wallets, providers } = require('../src/services/blockchain');

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)'
];

async function verify() {
  const networkName = 'polygon';
  const network = config.networks[networkName];
  const wallet = wallets[networkName];
  
  console.log(`--- Verificação de Tokens na Polygon ---`);
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Router: ${network.router}`);

  for (const tokenConfig of network.tokens) {
    const contract = new ethers.Contract(tokenConfig.address, ERC20_ABI, providers.polygon);
    
    try {
      const symbol = await contract.symbol();
      const decimals = await contract.decimals();
      const balance = await contract.balanceOf(wallet.address);
      const allowance = await contract.allowance(wallet.address, network.router);
      
      console.log(`\nToken: ${symbol} (${tokenConfig.address})`);
      console.log(`Decimais: ${decimals}`);
      console.log(`Saldo: ${ethers.formatUnits(balance, decimals)}`);
      console.log(`Allowance para Router Bot: ${ethers.formatUnits(allowance, decimals)}`);
      
      if (tokenConfig.decimals !== Number(decimals)) {
        console.error(`❌ ERRO: Decimais no config.js (${tokenConfig.decimals}) não batem com o contrato (${decimals})!`);
      }
    } catch (e) {
      console.error(`Erro ao verificar ${tokenConfig.name}: ${e.message}`);
    }
  }
}

verify();
