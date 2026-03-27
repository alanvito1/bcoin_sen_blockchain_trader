const { ethers } = require('ethers');
const { providers } = require('../src/services/blockchain');

async function checkPair() {
  const pairAddress = '0xd6c2de543dd1570315cc0bebcdaea522553b7e2b';
  const provider = providers.polygon;
  
  const abi = [
    'function token0() view returns (address)',
    'function token1() view returns (address)',
    'function factory() view returns (address)',
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
  ];
  
  const erc20 = ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'];

  const contract = new ethers.Contract(pairAddress, abi, provider);
  
  try {
    const t0 = await contract.token0();
    const t1 = await contract.token1();
    const factory = await contract.factory();
    const res = await contract.getReserves();
    
    const c0 = new ethers.Contract(t0, erc20, provider);
    const c1 = new ethers.Contract(t1, erc20, provider);
    
    const s0 = await c0.symbol();
    const d0 = await c0.decimals();
    const s1 = await c1.symbol();
    const d1 = await c1.decimals();

    console.log(`--- Analisando Par: ${pairAddress} ---`);
    console.log(`Factory do Par: ${factory}`);
    console.log(`Token 0: ${s0} (${t0}) - Decimais: ${d0} - Reserva: ${res.reserve0.toString()}`);
    console.log(`Token 1: ${s1} (${t1}) - Decimais: ${d1} - Reserva: ${res.reserve1.toString()}`);

  } catch (e) {
    console.error(`Erro: ${e.message}`);
  }
}

checkPair();
