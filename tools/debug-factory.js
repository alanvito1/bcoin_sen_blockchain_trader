const config = require('../src/config');
const { providers } = require('../src/services/blockchain');

const ROUTER_ABI = [
  'function factory() view returns (address)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)'
];

async function debug() {
  const network = config.networks.polygon;
  const provider = providers.polygon;
  
  const router = new ethers.Contract(network.router, ROUTER_ABI, provider);
  const factoryAddr = await router.factory();
  const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);

  const BCOIN = ethers.getAddress('0xb2c63830d4478cb331142fac075a39671a5541dc');
  const USDT = ethers.getAddress('0xc2132d05d31c914a87c6611c10748aeb04b58e8f');
  const WPOL = ethers.getAddress('0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270');

  console.log(`Router: ${network.router}`);
  console.log(`Factory: ${factoryAddr}`);

  // 1. Check Pairs
  console.log('\n--- Verificando Pares na Factory ---');
  const pairBCOIN_USDT = await factory.getPair(BCOIN, USDT);
  console.log(`Par BCOIN/USDT: ${pairBCOIN_USDT}`);
  
  const pairUSDT_WPOL = await factory.getPair(USDT, WPOL);
  console.log(`Par USDT/WPOL: ${pairUSDT_WPOL}`);

  // DEZCREENER pair was: 0x8b4e00810c927bb1c02dee73d714a31121689ab3
  if (pairBCOIN_USDT.toLowerCase() === '0x8b4e00810c927bb1c02dee73d714a31121689ab3'.toLowerCase()) {
    console.log('✅ O Par da Factory BATE com o do DexScreener!');
  } else {
    console.warn('❌ O Par da Factory É DIFERENTE do DexScreener!');
  }

  // 2. Test getAmountsOut
  console.log('\n--- Testando getAmountsOut ---');
  try {
    const amounts = await router.getAmountsOut(ethers.parseUnits('1', 18), [BCOIN, USDT]);
    console.log(`✅ BCOIN -> USDT: ${ethers.formatUnits(amounts[1], 6)}`);
  } catch (e) {
    console.error(`❌ BCOIN -> USDT Falhou: ${e.message}`);
  }

  try {
    // Try a very small amount in case of liquidity issues
    const amounts = await router.getAmountsOut(ethers.parseUnits('0.0001', 18), [BCOIN, USDT]);
    console.log(`✅ BCOIN -> USDT (Small): ${ethers.formatUnits(amounts[1], 6)}`);
  } catch (e) {
     console.error(`❌ BCOIN -> USDT (Small) Falhou: ${e.message}`);
  }
}

debug();
