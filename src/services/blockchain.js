const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Bulletproof Round-Robin Provider
 * Uses a Proxy to transparently failover between multiple RPC nodes on every call.
 * Intercepts infrastructure failures to provide user-friendly feedback.
 */
function createBulletproofProvider(networkKey) {
  const netConfig = config.networks[networkKey];
  const rpcList = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
  
  const providers = rpcList.map(url => new ethers.JsonRpcProvider(url, netConfig.chainId, { staticNetwork: true }));
  
  if (providers.length === 0) {
    throw new Error(`Nenhum nó RPC configurado para a rede ${networkKey}`);
  }

  // Create a handler that retries on all providers
  return new Proxy(providers[0], {
    get(target, prop) {
      const originalValue = target[prop];
      
      if (typeof originalValue === 'function') {
        return async (...args) => {
          let lastError;
          for (const provider of providers) {
            try {
              return await provider[prop].apply(provider, args);
            } catch (err) {
              lastError = err;
              const rpcUrl = provider._getAddress ? provider._getAddress() : 'unknown-node';
              logger.warn(`[Blockchain] ⚠️ RPC Node Failed (${rpcUrl}): ${err.message}. Tentando próximo...`);
              continue;
            }
          }
          
          // Se todos falharem, formatamos a mensagem amigável solicitada pelo Founder
          const friendlyError = new Error(`🔴 OPERAÇÃO CANCELADA: Falha massiva de comunicação com a Blockchain (RPC Down na rede ${networkKey.toUpperCase()})`);
          friendlyError.originalError = lastError;
          throw friendlyError;
        };
      }
      return originalValue;
    }
  });
}

const providers = {
  bsc: createBulletproofProvider('bsc'),
  polygon: createBulletproofProvider('polygon')
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
