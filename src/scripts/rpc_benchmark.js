const { ethers } = require('ethers');
const logger = require('../utils/logger');

const RPC_LIST = {
  bsc: [
    'https://bsc-dataseed.binance.org',
    'https://bsc.publicnode.com',
    'https://binance.llamarpc.com',
    'https://1rpc.io/bnb',
    'https://rpc.ankr.com/bsc',
    'https://bsc-dataseed1.defibit.io'
  ],
  polygon: [
    'https://polygon-rpc.com',
    'https://polygon.llamarpc.com',
    'https://polygon.publicnode.com',
    'https://1rpc.io/matic',
    'https://rpc.ankr.com/polygon'
  ]
};

async function testNode(network, url) {
  const start = Date.now();
  try {
    const provider = new ethers.JsonRpcProvider(url, null, { staticNetwork: true });
    // Test basic connectivity and estimateGas capability
    const block = await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 5000))
    ]);
    const latency = Date.now() - start;
    return { url, latency, block, status: 'OK' };
  } catch (e) {
    return { url, latency: Date.now() - start, block: null, status: 'FAIL', error: e.message };
  }
}

async function runBenchmark() {
  console.log('🛡️  Iniciando Benchmark de Resiliência RPC...\n');

  for (const network of Object.keys(RPC_LIST)) {
    console.log(`--- [${network.toUpperCase()}] ---`);
    const results = await Promise.all(RPC_LIST[network].map(url => testNode(network, url)));
    
    const sorted = results.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'OK' ? -1 : 1;
        return a.latency - b.latency;
    });

    sorted.forEach(r => {
      const icon = r.status === 'OK' ? '✅' : '❌';
      const latencyStr = r.latency > 1000 ? `\x1b[31m${r.latency}ms\x1b[0m` : `\x1b[32m${r.latency}ms\x1b[0m`;
      console.log(`${icon}  ${r.url.padEnd(40)} | ${r.status.padEnd(5)} | ${latencyStr}`);
    });
    console.log('');
  }
}

runBenchmark();
