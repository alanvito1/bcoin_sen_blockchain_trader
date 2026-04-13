const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Resilient Provider for Ethers.js v6
 * Delegates calls to a list of JsonRpcProviders with automatic failover.
 * This avoids Proxy-related context issues (target=null) in ethers internal logic.
 */
class BulletproofProvider {
  constructor(networkKey) {
    this.networkKey = networkKey;
    const netConfig = config.networks[networkKey];
    this.rpcList = netConfig.rpc.split(',').map(url => url.trim()).filter(Boolean);
    
    this.providers = this.rpcList.map(url => new ethers.JsonRpcProvider(url, netConfig.chainId, { staticNetwork: true }));
    
    if (this.providers.length === 0) {
      throw new Error(`Nenhum nó RPC configurado para a rede ${networkKey}`);
    }

    // Reference to the first provider for legacy field access if needed
    this.provider = this.providers[0];
  }

  async _execute(method, args) {
    let lastError;
    for (let i = 0; i < this.providers.length; i++) {
        const provider = this.providers[i];
        try {
            return await provider[method](...args);
        } catch (err) {
            lastError = err;
            const rpcUrl = this.rpcList[i] || 'unknown';

            // Smart Failover: If it's a Contract Revert (CALL_EXCEPTION), all nodes will return the same.
            // Do NOT failover or log as 'Warning', just throw immediately to save time.
            if (err.code === 'CALL_EXCEPTION') {
                logger.debug(`[Blockchain] 📡 Contract Revert detected: ${err.reason || 'No specific reason'}`);
                throw err;
            }

            logger.warn(`[Blockchain] ⚠️ Failover (${this.networkKey.toUpperCase()}): node=${rpcUrl} error=${err.message.slice(0, 100)}`);
            continue;
        }
    }
    
    const friendlyError = new Error(`🔴 FALHA MASSIVA: Comunicação perdida com a rede ${this.networkKey.toUpperCase()}`);
    friendlyError.originalError = lastError;
    throw friendlyError;
  }

  // Explicit delegation of most common methods to ensure stability
  getTransactionCount(...args) { return this._execute('getTransactionCount', args); }
  getBalance(...args) { return this._execute('getBalance', args); }
  getFeeData(...args) { return this._execute('getFeeData', args); }
  getLogs(...args) { return this._execute('getLogs', args); }
  getCode(...args) { return this._execute('getCode', args); }
  getStorage(...args) { return this._execute('getStorage', args); }
  getTransaction(...args) { return this._execute('getTransaction', args); }
  getTransactionReceipt(...args) { return this._execute('getTransactionReceipt', args); }
  getBlock(...args) { return this._execute('getBlock', args); }
  getBlockNumber(...args) { return this._execute('getBlockNumber', args); }
  getNetwork(...args) { return this.providers[0].getNetwork(); } // Network is static
  sendTransaction(...args) { return this._execute('broadcastTransaction', args); }
  broadcastTransaction(...args) { return this._execute('broadcastTransaction', args); }
  call(...args) { return this._execute('call', args); }
  estimateGas(...args) { return this._execute('estimateGas', args); }

  // Support for ethers Contract/Wallet needs
  get _isProvider() { return true; }
  on(...args) { return this.providers[0].on(...args); }
  once(...args) { return this.providers[0].once(...args); }
  emit(...args) { return this.providers[0].emit(...args); }
  off(...args) { return this.providers[0].off(...args); }
  removeListener(...args) { return this.providers[0].removeListener(...args); }
  waitForTransaction(...args) { return this._execute('waitForTransaction', args); }
}

const providers = {
  bsc: new BulletproofProvider('bsc'),
  polygon: new BulletproofProvider('polygon')
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
