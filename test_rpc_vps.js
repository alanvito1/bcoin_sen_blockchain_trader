const { ethers } = require('ethers');
const config = require('./src/config');

async function testNetwork(name, networkKey) {
  console.log(`\n--- TESTING ${name.toUpperCase()} ---`);
  const netConfig = config.networks[networkKey];
  const allRpcs = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
  
  for (const url of allRpcs) {
    console.log(`Checking RPC: ${url}`);
    try {
      const provider = new ethers.JsonRpcProvider(url, { chainId: netConfig.chainId, name: networkKey }, { staticNetwork: true });
      const block = await provider.getBlockNumber();
      const balance = await provider.getBalance("0xC761af7d6118A74d3d641Dbd426BA7cfb3b4CFCe");
      console.log(`✅ Success! Block: ${block} | Balance: ${ethers.formatUnits(balance, 18)}`);
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
    }
  }
}

async function start() {
  await testNetwork('Polygon', 'polygon');
  await testNetwork('BSC', 'bsc');
}

start().catch(console.error);
