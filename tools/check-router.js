const { ethers } = require('ethers');
const { providers } = require('./src/blockchain');

async function checkRouter() {
  const routerAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'.toLowerCase();
  const provider = providers.polygon;
  
  const abi = [
    'function factory() view returns (address)',
    'function WETH() view returns (address)',
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
  ];
  
  const router = new ethers.Contract(routerAddress, abi, provider);
  
  try {
    const factory = await router.factory();
    const WETH = await router.WETH();
    console.log(`Router: ${routerAddress}`);
    console.log(`Factory: ${factory}`);
    console.log(`WETH (WPOL): ${WETH}`);
    
    // Test a basic path: WETH -> USDT
    const USDT = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
    const amounts = await router.getAmountsOut(ethers.parseUnits('1', 18), [WETH, USDT]);
    console.log(`✅ Teste WETH -> USDT Sucesso: ${amounts[1].toString()}`);
  } catch (e) {
    console.error(`Erro: ${e.message}`);
  }
}

checkRouter();
