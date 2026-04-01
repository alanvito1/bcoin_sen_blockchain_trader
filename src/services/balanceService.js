const { formatUnits, Contract, JsonRpcProvider } = require('ethers');
const prisma = require('../config/prisma');
const { notificationQueue } = require('../config/queue');
const { providers } = require('./blockchain');
const logger = require('../utils/logger');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const GAS_THRESHOLDS = {
  BSC: 0.001,      // 0.001 BNB
  POLYGON: 0.1     // 0.1 MATIC
};

// Eternal Cache (Self-Regenerating)
const balanceCache = new Map(); // Key: `${address}-${network}-${token}`, Value: { data, timestamp }
const CACHE_TTL = 1000 * 60 * 2; // 2 minutes max age for fallback

/**
 * Checks native and token balances. Pauses bot if gas is insufficient.
 * Includes retry logic, single-RPC fallback, and SWR caching for maximum resilience.
 */
async function checkBalances(publicAddress, network, tokenAddress = null) {
  const cacheKey = `${publicAddress}-${network}-${tokenAddress || 'native'}`;
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let provider = providers[network.toLowerCase()];
      
      // On final retry, use a direct single-RPC provider as fallback (Emergency Recovery)
      if (attempt === MAX_RETRIES && provider) {
        const config = require('../config');
        const netConfig = config.networks[network.toLowerCase()];
        const rpcList = netConfig.rpc.split(',').map(r => r.trim()).filter(Boolean);
        // Try the second one if the first failed, or just the first
        const fallbackRpc = rpcList[1] || rpcList[0];
        provider = new JsonRpcProvider(fallbackRpc, { chainId: netConfig.chainId, name: network.toLowerCase() }, { staticNetwork: true });
        logger.info(`[BalanceService] Emergency: Using fallback single-RPC for ${network}: ${fallbackRpc}`);
      }

      if (!provider) throw new Error(`Provider para ${network} não encontrado.`);

      // 1. Check Native Gas Balance
      const nativeBalanceWei = await provider.getBalance(publicAddress);
      const nativeBalance = parseFloat(formatUnits(nativeBalanceWei, 18));
      
      const hasEnoughGas = nativeBalance >= GAS_THRESHOLDS[network.toUpperCase()];

      let tokenBalance = 0;
      let tokenSymbol = 'N/A';

      // 2. Check Token Balance if provided
      if (tokenAddress) {
        const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);
        const [balanceWei, decimals, symbol] = await Promise.all([
          tokenContract.balanceOf(publicAddress),
          tokenContract.decimals(),
          tokenContract.symbol()
        ]);
        tokenBalance = formatUnits(balanceWei, decimals);
        tokenSymbol = symbol;
      }

      const result = {
        nativeBalance,
        hasEnoughGas,
        tokenBalance,
        tokenSymbol,
        isCached: false,
        timestamp: Date.now()
      };

      // Update Cache
      balanceCache.set(cacheKey, result);

      // 3. Auto-Pause Logic
      if (!hasEnoughGas) {
        const userWallet = await prisma.wallet.findFirst({ where: { publicAddress } });
        if (userWallet) {
          await prisma.tradeConfig.updateMany({
            where: { userId: userWallet.userId },
            data: { isOperating: false }
          });

          const gasUnit = network === 'POLYGON' ? 'MATIC' : 'BNB';
          await notificationQueue.add('pauseNotification', {
            userId: userWallet.userId,
            message: `🚨 Seu bot foi pausado por falta de saldo para taxas (${nativeBalance} ${gasUnit} < ${GAS_THRESHOLDS[network.toUpperCase()]} ${gasUnit}). Recarregue sua carteira.`
          });
        }
      }

      return result;
    } catch (error) {
      lastError = error;
      const isRpcError = error.message?.includes('quorum') || error.message?.includes('bad data') || error.code === 'SERVER_ERROR';
      
      logger.warn(`[BalanceService] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${network}: ${isRpcError ? 'RPC issue' : error.message}`);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
      }
    }
  }

  // SELF-REGENERATION: If all attempts failed, try to use Cache as last resort
  const cachedValue = balanceCache.get(cacheKey);
  if (cachedValue && (Date.now() - cachedValue.timestamp) < CACHE_TTL) {
    logger.info(`[BalanceService] Network failure. Recovering with cached balance for ${publicAddress} (${network})`);
    return { ...cachedValue, isCached: true };
  }

  throw lastError;
}

/**
 * Checks native and token balances for both supported networks.
 */
async function getMultiChainBalances(publicAddress) {
  const cacheKey = `multi-${publicAddress.toLowerCase()}`;
  const cached = balanceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }

  const config = require('../config');
  const networks = ['polygon', 'bsc'];
  
  const networkPromises = networks.map(async (network) => {
    const provider = providers[network];
    const netConfig = config.networks[network];

    if (!provider) return { network, error: 'Provider not found' };

    try {
      // 1. Native Balance
      const nativeBalanceWei = await provider.getBalance(publicAddress);
      const nativeBalance = parseFloat(formatUnits(nativeBalanceWei, 18));
      const gasUnit = network === 'polygon' ? 'POL' : 'BNB';

      // 2. Token Balances (USDT, SEN, BCOIN)
      const tokensToCheck = [
        { name: 'USDT', address: netConfig.usdt, decimals: 18 },
        ...netConfig.tokens
      ];

      const tokenBalances = {};
      
      const tokenPromises = tokensToCheck.map(async (t) => {
        try {
          const tokenContract = new Contract(t.address, ERC20_ABI, provider);
          const balanceWei = await tokenContract.balanceOf(publicAddress);
          tokenBalances[t.name] = parseFloat(formatUnits(balanceWei, t.decimals || 18)).toFixed(2);
        } catch (e) {
          tokenBalances[t.name] = '0.00';
        }
      });

      await Promise.all(tokenPromises);

      return {
        network,
        data: {
          nativeBalance: nativeBalance.toFixed(4),
          gasUnit,
          tokens: tokenBalances,
          hasEnoughGas: nativeBalance >= GAS_THRESHOLDS[network.toUpperCase()]
        }
      };
    } catch (error) {
      return { network, error: error.message };
    }
  });

  const settledResults = await Promise.allSettled(networkPromises);
  const results = {};

  settledResults.forEach((res) => {
    if (res.status === 'fulfilled') {
      const { network, data, error } = res.value;
      if (error) {
        logger.error(`[BalanceService] Error for ${network}: ${error}`);
        results[network] = null;
      } else {
        results[network] = data;
      }
    }
  });

  const finalResult = {
    timestamp: Date.now(),
    data: results
  };

  // Update Cache
  balanceCache.set(cacheKey, finalResult);

  return results;
}

module.exports = {
  checkBalances,
  getMultiChainBalances
};
