const { ethers } = require('ethers');
const config = require('../src/config');
const { providers } = require('../src/services/blockchain');

const ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

async function checkLiquidity() {
  const network = config.networks.polygon;
  const provider = providers.polygon;
  const routerAddress = ethers.getAddress(network.router);
  const router = new ethers.Contract(routerAddress, ROUTER_ABI, provider);

  const amountIn = ethers.getBigInt(ethers.parseUnits('1.0', 18));

  const tokens = network.tokens;

  for (const token of tokens) {
    console.log(`\n--- Analisando ${token.symbol} (${token.address}) ---`);
    
    // Path 1: Direct to WPOL
    const pathDirect = [token.address, network.wrappedNative];
    try {
      const amounts = await router.getAmountsOut(amountIn, pathDirect);
      console.log(`✅ Rota Direta (Token -> WPOL) funciona! Retorno: ${ethers.formatUnits(amounts[amounts.length-1], 18)} POL`);
    } catch (e) {
      console.log(`❌ Rota Direta (Token -> WPOL) falhou: ${e.shortMessage || e.message}`);
    }

    // Path 2: Via USDT
    if (network.usdt) {
      const pathUSDT = [token.address, network.usdt, network.wrappedNative];
      try {
        const amounts = await router.getAmountsOut(amountIn, pathUSDT);
        console.log(`✅ Rota via USDT (Token -> USDT -> WPOL) funciona! Retorno: ${ethers.formatUnits(amounts[amounts.length-1], 18)} POL`);
      } catch (e) {
        console.log(`❌ Rota via USDT (Token -> USDT -> WPOL) falhou: ${e.shortMessage || e.message}`);
      }
    }

    // Path 4: Direct to USDT
    if (network.usdt && token.address.toLowerCase() !== network.usdt.toLowerCase()) {
      const pathDirectUSDT = [token.address, network.usdt];
      try {
        const amounts = await router.getAmountsOut(amountIn, pathDirectUSDT);
        console.log(`✅ Rota Direta (Token -> USDT) funciona! Retorno: ${ethers.formatUnits(amounts[amounts.length-1], 6)} USDT`);
      } catch (e) {
        console.log(`❌ Rota Direta (Token -> USDT) falhou: ${e.shortMessage || e.message}`);
      }
    }
  }
}

checkLiquidity();
