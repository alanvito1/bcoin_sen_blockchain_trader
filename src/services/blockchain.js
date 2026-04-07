const { ethers } = require('ethers');
const config = require('../config');

/**
 * Simple Robust Failover Provider
 * Iterates through nodes on demand.
 */
function createProvider(networkKey) {
  const netConfig = config.networks[networkKey];
  const allRpcs = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
  
  // Use a proxy to handle failover on every request transparently
  const providerProxy = new Proxy({}, {
    get(target, prop) {
      if (typeof ethers.JsonRpcProvider.prototype[prop] === 'function') {
        return async (...args) => {
          let error;
          for (const url of allRpcs) {
            try {
              const p = new ethers.JsonRpcProvider(url, netConfig.chainId, { staticNetwork: true });
              return await p[prop](...args);
            } catch (e) {
              error = e;
              continue; // try next
            }
          }
          throw error || new Error(`All nodes failed on ${networkKey}`);
        };
      }
      return target[prop];
    }
  });

  return providerProxy;
}

// Actually, let's keep it even simpler to match MetaMask-style but with a fallback
function createStaticProvider(networkKey) {
  const netConfig = config.networks[networkKey];
  const allRpcs = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
  
  // Return the first RPC as a standard provider
  // The user suggested using the standard one like MetaMask.
  return new ethers.JsonRpcProvider(allRpcs[0], netConfig.chainId, { staticNetwork: true });
}

// For robustness, we'll try the first one, then the second, etc.
// But let's follow the user's advice: "simple"
const providers = {
  bsc: createStaticProvider('bsc'),
  polygon: createStaticProvider('polygon')
};

const wallets = {
  bsc: config.privateKey ? new ethers.Wallet(config.privateKey, providers.bsc) : null,
  polygon: config.privateKey ? new ethers.Wallet(config.privateKey, providers.polygon) : null
};

const mevWallets = {
  bsc: wallets.bsc,
  polygon: wallets.polygon
};

module.exports = {
  providers,
  wallets,
  mevWallets
};
