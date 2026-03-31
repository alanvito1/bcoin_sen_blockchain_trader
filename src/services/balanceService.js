const { JsonRpcProvider, formatUnits, Contract } = require('ethers');
const prisma = require('../config/prisma');
const { notificationQueue } = require('../config/queue');

const { providers } = require('./blockchain');

// In-memory cache for balances
const BALANCE_CACHE = new Map();
const CACHE_TTL = 30000; // 30 seconds

const GAS_THRESHOLDS = {
  POLYGON: 0.05,
  BSC: 0.002
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

/**
 * Checks native and token balances. Pauses bot if gas is insufficient.
 */
async function checkBalances(publicAddress, network, tokenAddress = null) {
  const provider = providers[network.toLowerCase()];
  if (!provider) throw new Error(`Provider para ${network} não encontrado.`);

  
  // 1. Check Native Gas Balance
  const nativeBalanceWei = await provider.getBalance(publicAddress);
  const nativeBalance = parseFloat(formatUnits(nativeBalanceWei, 18));
  
  const hasEnoughGas = nativeBalance >= GAS_THRESHOLDS[network];

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

  // 3. Auto-Pause Logic
  if (!hasEnoughGas) {
    const userWallet = await prisma.wallet.findFirst({ where: { publicAddress } });
    if (userWallet) {
      await prisma.tradeConfig.updateMany({
        where: { userId: userWallet.userId },
        data: { isOperating: false }
      });

      // Notify User via Queue
      const gasUnit = network === 'POLYGON' ? 'MATIC' : 'BNB';
      await notificationQueue.add('pauseNotification', {
        userId: userWallet.userId,
        message: `🚨 Seu bot foi pausado por falta de saldo para taxas (${nativeBalance} ${gasUnit} < ${GAS_THRESHOLDS[network]} ${gasUnit}). Recarregue sua carteira.`
      });
    }
  }

  return {
    nativeBalance,
    hasEnoughGas,
    tokenBalance,
    tokenSymbol
  };
}

/**
 * Checks native and token balances for both supported networks.
 */
async function getMultiChainBalances(publicAddress) {
  const cacheKey = publicAddress.toLowerCase();
  const cached = BALANCE_CACHE.get(cacheKey);
  
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
        { name: 'USDT', address: netConfig.usdt, decimals: 18 }, // Most USDT on Poly/BSC are 18, but worth checking
        ...netConfig.tokens
      ];

      const tokenBalances = {};
      
      const tokenPromises = tokensToCheck.map(async (t) => {
        try {
          const tokenContract = new Contract(t.address, ERC20_ABI, provider);
          const balanceWei = await tokenContract.balanceOf(publicAddress);
          // Standardizing to 18 decimals for these specific tokens in this bot
          tokenBalances[t.name] = parseFloat(formatUnits(balanceWei, 18)).toFixed(2);
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
        console.error(`[BalanceService] Error for ${network}:`, error);
        results[network] = null;
      } else {
        results[network] = data;
      }
    }
  });

  // Update Cache
  BALANCE_CACHE.set(cacheKey, {
    timestamp: Date.now(),
    data: results
  });

  return results;
}

module.exports = {
  checkBalances,
  getMultiChainBalances
};
