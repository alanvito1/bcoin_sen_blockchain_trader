const swapper = require('../src/services/swapper');
const explorer = require('../src/utils/explorer');
const config = require('../src/config');
const { ethers } = require('ethers');

async function test() {
  console.log("--- POLYGON GAS AUDIT ---");
  const gas = await explorer.getPolygonGasPrice();
  console.log("Gas Station API response:", gas);

  const tokenConfig = {
    address: config.networks.polygon.tokens.find(t => t.symbol === 'BCOIN').address,
    symbol: 'BCOIN',
    decimals: 18,
    isDryRun: true
  };

  console.log("\n--- SWAPPER SIMULATION (POLYGON) ---");
  const result = await swapper.swapToken(
    'polygon',
    tokenConfig,
    'buy',
    0.1, // Small native buy
    'native',
    0.05 // Mock price
  );

  console.log("\nResult:", JSON.stringify(result, null, 2));
}

test();
