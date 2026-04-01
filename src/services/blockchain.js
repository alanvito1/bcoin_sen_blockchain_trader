const { ethers } = require('ethers');
const config = require('../config');

function createProvider(networkKey) {
  const netConfig = config.networks[networkKey];
  const rpcs = netConfig.rpc.split(',').map(url => url.trim());
  
  const providers = rpcs.map(url => 
    new ethers.JsonRpcProvider(url, { chainId: netConfig.chainId, name: networkKey }, { staticNetwork: true })
  );

  // ethers v6 FallbackProvider correctly handles priorities and weight
  return new ethers.FallbackProvider(providers);
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
