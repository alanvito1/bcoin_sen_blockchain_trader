const { ethers } = require('ethers');
const config = require('../config');

function createProvider(networkKey) {
  const netConfig = config.networks[networkKey];
  const rpcs = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
  
  if (rpcs.length === 0) {
    throw new Error(`No RPCs configured for network: ${networkKey}`);
  }

  // Single RPC → simple JsonRpcProvider (no quorum needed)
  if (rpcs.length === 1) {
    return new ethers.JsonRpcProvider(rpcs[0], { chainId: netConfig.chainId, name: networkKey }, { staticNetwork: true });
  }

  const providerConfigs = rpcs.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url, { chainId: netConfig.chainId, name: networkKey }, { staticNetwork: true }),
    priority: i + 1,       // Lower = higher priority
    stallTimeout: 2000,    // 2s timeout before trying next provider
    weight: 1
  }));

  // quorum=1: Any single successful RPC response is enough.
  // Public RPCs frequently rate-limit, causing "quorum not met" with default quorum=2.
  return new ethers.FallbackProvider(providerConfigs, 1);
}

const providers = {
  bsc: createProvider('bsc'),
  polygon: createProvider('polygon')
};

const mevProviders = {
  bsc: config.networks.bsc.mevRpc ? new ethers.JsonRpcProvider(config.networks.bsc.mevRpc, { chainId: 56, name: 'bsc' }, { staticNetwork: true }) : providers.bsc,
  polygon: config.networks.polygon.mevRpc ? new ethers.JsonRpcProvider(config.networks.polygon.mevRpc, { chainId: 137, name: 'polygon' }, { staticNetwork: true }) : providers.polygon
};

// Add error listeners to prevent unhandled background rejections
Object.entries(providers).forEach(([name, provider]) => {
  provider.on('error', (error) => {
    console.error(`[Blockchain] Provider Error on ${name.toUpperCase()}:`, error.message || error);
  });
});

const wallets = {
  bsc: config.privateKey ? new ethers.Wallet(config.privateKey, providers.bsc) : null,
  polygon: config.privateKey ? new ethers.Wallet(config.privateKey, providers.polygon) : null
};

const mevWallets = {
  bsc: config.privateKey ? new ethers.Wallet(config.privateKey, mevProviders.bsc) : null,
  polygon: config.privateKey ? new ethers.Wallet(config.privateKey, mevProviders.polygon) : null
};

module.exports = {
  providers,
  wallets,
  mevWallets
};
