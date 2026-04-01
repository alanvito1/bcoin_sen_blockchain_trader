const { ethers } = require('ethers');
const config = require('../config');

const rpcHealth = {}; // { [url]: { failures: 0, lastFailure: 0 } }
const BLACKLIST_DURATION = 1000 * 60 * 5; // 5 minutes
const PERMANENT_BLACKLIST_DURATION = 1000 * 60 * 60 * 24; // 24 hours

function createProvider(networkKey) {
  const netConfig = config.networks[networkKey];
  const allRpcs = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
  
  if (allRpcs.length === 0) {
    throw new Error(`No RPCs configured for network: ${networkKey}`);
  }

  // Filter out blacklisted RPCs
  const now = Date.now();
  const availableRpcs = allRpcs.filter(url => {
    const health = rpcHealth[url];
    if (health) {
      if (health.permanent && (now - health.lastFailure) < PERMANENT_BLACKLIST_DURATION) {
        return false;
      }
      if (health.failures >= 3 && (now - health.lastFailure) < BLACKLIST_DURATION) {
        return false;
      }
    }
    return true;
  });

  // If all are blacklisted, reset the most stable one
  const rpcsToUse = availableRpcs.length > 0 ? availableRpcs : [allRpcs[0]];

  const providerConfigs = rpcsToUse.map((url, i) => {
    const provider = new ethers.JsonRpcProvider(url, { 
      chainId: netConfig.chainId, 
      name: networkKey 
    }, { 
      staticNetwork: true,
      batchMaxCount: 1 // Safer for public RPCs
    });

    // Overwrite perform to track health
    const originalPerform = provider._perform.bind(provider);
    provider._perform = async (req, params) => {
      try {
        const result = await originalPerform(req, params);
        // Successful request -> reset failures
        if (!rpcHealth[url]) rpcHealth[url] = { failures: 0, lastFailure: 0, permanent: false };
        rpcHealth[url].failures = 0;
        return result;
      } catch (error) {
        if (!rpcHealth[url]) rpcHealth[url] = { failures: 0, lastFailure: 0 };
        rpcHealth[url].failures++;
        rpcHealth[url].lastFailure = Date.now();
        
        const errorMessage = error.message || '';
        const isAuthError = errorMessage.includes('401') || 
                           errorMessage.includes('Unauthorized') || 
                           errorMessage.includes('API key');
        
        const isThrottled = errorMessage.includes('429') || 
                           errorMessage.includes('too many requests') ||
                           errorMessage.includes('rate limit');

        const isBadRequest = errorMessage.includes('400') ||
                            errorMessage.includes('bad request');

        if (isAuthError) {
          rpcHealth[url].permanent = true;
          console.error(`[ConnectivityEngine] PERMANENT Blacklist: ${url} (Requires API Key)`);
        } else if (isThrottled || isBadRequest) {
          // Increase failure count aggressively for throttled or broken nodes
          rpcHealth[url].failures += 5; 
          rpcHealth[url].lastFailure = Date.now();
          console.warn(`[ConnectivityEngine] RPC Throttled/Broken: ${url} (${errorMessage}). Rotating...`);
        } else {
          const isCritical = errorMessage.includes('bad data') || error.code === 'SERVER_ERROR' || error.code === 'NETWORK_ERROR';
          if (isCritical) {
            console.warn(`[ConnectivityEngine] RPC Fail: ${url} (Network: ${networkKey}). Error: ${error.shortMessage || errorMessage}`);
          }
        }
        throw error;
      }
    };

    return {
      provider,
      priority: i + 1,
      stallTimeout: 3000, // wait 3s before shifting
      weight: 1
    };
  });

  // quorum=1: Highly resilient. One good response is enough.
  return new ethers.FallbackProvider(providerConfigs, 1);
}

const providers = {
  bsc: createProvider('bsc'),
  polygon: createProvider('polygon')
};

// Auto-refresh providers every 10 minutes to re-evaluate blacklisted nodes
setInterval(() => {
  providers.bsc = createProvider('bsc');
  providers.polygon = createProvider('polygon');
  console.log('[ConnectivityEngine] Periodic provider refresh completed.');
}, 1000 * 60 * 10);

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
