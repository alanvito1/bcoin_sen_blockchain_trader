const { ethers } = require('ethers');
const config = require('../src/config');
const { providers, wallets } = require('../src/services/blockchain');

async function check() {
  const provider = providers.polygon;
  const wallet = wallets.polygon;
  const bcoin = '0xb2c63830d4478cb331142fac075a39671a5541dc';
  const sen = '0xfe302b8666539d5046cd9aa0707bb327f5f94c22';

  const abi = ['function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'];
  
  for (const addr of [bcoin, sen]) {
    const contract = new ethers.Contract(addr, abi, provider);
    const symbol = await contract.symbol();
    const decimals = await contract.decimals();
    const balance = await contract.balanceOf(wallet.address);
    console.log(`\nToken: ${symbol}`);
    console.log(`Address: ${addr}`);
    console.log(`Decimals: ${decimals}`);
    console.log(`Raw Balance: ${balance.toString()}`);
    console.log(`Formatted: ${ethers.formatUnits(balance, decimals)}`);
  }
}

check();
