const axios = require('axios');

const RPC_LIST = {
  bsc: [
    'https://bsc-dataseed.binance.org',
    'https://bsc.publicnode.com',
    'https://binance.llamarpc.com',
    'https://1rpc.io/bnb',
    'https://rpc.ankr.com/bsc',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-dataseed2.defibit.io',
    'https://bsc-dataseed3.defibit.io'
  ],
  polygon: [
    'https://polygon-rpc.com',
    'https://polygon.llamarpc.com',
    'https://polygon.publicnode.com',
    'https://1rpc.io/matic',
    'https://rpc.ankr.com/polygon'
  ]
};

async function testNode(url) {
  const start = Date.now();
  try {
    const res = await axios.post(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_blockNumber',
      params: []
    }, { timeout: 3500 });

    const latency = Date.now() - start;
    if (res.data && res.data.result) {
      return { url, latency, status: 'OK' };
    }
    return { url, latency, status: 'ERROR', detail: 'Invalid response' };
  } catch (e) {
    return { url, latency: Date.now() - start, status: 'FAIL', detail: e.message };
  }
}

async function runBenchmark() {
  console.log('🛡️  Iniciando Benchmark de Resiliência RPC (Axios Speed Edition)...\n');

  for (const network of Object.keys(RPC_LIST)) {
    console.log(`--- [${network.toUpperCase()}] ---`);
    const results = await Promise.all(RPC_LIST[network].map(url => testNode(url)));
    
    const sorted = results.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'OK' ? -1 : 1;
        return a.latency - b.latency;
    });

    sorted.forEach(r => {
      const icon = r.status === 'OK' ? '✅' : '❌';
      const latencyStr = r.latency > 1000 ? `\x1b[31m${r.latency}ms\x1b[0m` : `\x1b[32m${r.latency}ms\x1b[0m`;
      const detail = r.status !== 'OK' ? ` (${r.detail})` : '';
      console.log(`${icon}  ${r.url.padEnd(40)} | ${r.status.padEnd(5)} | ${latencyStr}${detail}`);
    });
    console.log('');
  }
}

runBenchmark();
