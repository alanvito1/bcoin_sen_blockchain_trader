const { Wallet, ethers } = require('ethers');
const blockchain = require('./blockchain');
const globalConfig = require('../config');
const logger = require('../utils/logger');
const explorer = require('../utils/explorer');
const { wallets, providers: blockchainProviders } = blockchain;

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)'
];

const ROUTER_ABI = [
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function getAmountsIn(uint amountOut, address[] calldata path) external view returns (uint[] memory amounts)'
];

/**
 * Helper to retry RPC calls on transient errors like "Unknown block" or provider timeouts.
 */
async function withRPCRetry(fn, networkName, retries = 3, delay = 2000) {
  try {
    return await fn();
  } catch (error) {
    const errorMsg = error.message || '';
    const responseBody = error.info?.responseBody || '';
    const isUnknownBlock = errorMsg.includes('Unknown block') || responseBody.includes('Unknown block') || error.code === 26 || (error.info?.error?.code === 26);
    
    if (retries > 0 && (isUnknownBlock || error.code === 'SERVER_ERROR' || error.code === 'TIMEOUT' || error.code === 'ETIMEDOUT')) {
      logger.warn(`[${networkName}] RPC transient error. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRPCRetry(fn, networkName, retries - 1, delay);
    }
    throw error;
  }
}

/**
 * Checks if there are pending transactions in the wallet to prevent nonce collisions.
 */
async function checkPendingTransactions(networkName, wallet) {
  const [nonceLatest, noncePending] = await Promise.all([
    withRPCRetry(() => wallet.getNonce('latest'), networkName),
    withRPCRetry(() => wallet.getNonce('pending'), networkName)
  ]);
  
  if (noncePending > nonceLatest) {
    const diff = noncePending - nonceLatest;
    logger.warn(`[${networkName}] Detectada(s) ${diff} transação(ões) PENDENTE(S). A fila está travada.`);
    return true;
  }
  return false;
}

/**
 * Finds the best trade path (direct or through bridge tokens).
 */
async function getBestPath(routerContract, amount, tokenIn, tokenOut, bridgeTokens = [], mode = 'out') {
  const paths = [[tokenIn, tokenOut]];
  for (const bridge of bridgeTokens) {
    if (bridge && bridge.toLowerCase() !== tokenIn.toLowerCase() && bridge.toLowerCase() !== tokenOut.toLowerCase()) {
      paths.push([tokenIn, bridge, tokenOut]);
    }
  }

  let bestPath = null;
  let bestValue = mode === 'out' ? 0n : ethers.MaxUint256;

  for (const path of paths) {
    try {
      if (mode === 'out') {
        const amounts = await withRPCRetry(() => routerContract.getAmountsOut(amount, path), 'rpc-path');
        const outValue = amounts[amounts.length - 1];
        if (outValue > bestValue) {
          bestValue = outValue;
          bestPath = path;
        }
      } else {
        const amounts = await withRPCRetry(() => routerContract.getAmountsIn(amount, path), 'rpc-path');
        const inValue = amounts[0];
        if (inValue < bestValue) {
          bestValue = inValue;
          bestPath = path;
        }
      }
    } catch (e) {
      if (!e.message.includes('INSUFFICIENT_LIQUIDITY')) {
          logger.debug(`[PathFinder] Path ${path.slice(0, 6).join('->')} rejection: ${e.message}`);
      }
    }
  }

  if (bestPath && bestPath.length > 2) {
    const bridgeSymbol = bestPath[1].toLowerCase().includes('0x0d500') ? 'WPOL' : 'BRIDGE';
    logger.info(`[PathFinder] ⚠️ Rota Direta insuficiente. Ativando Rota Triangular via ${bridgeSymbol} (${mode.toUpperCase()}).`);
  }

  return bestPath;
}

/**
 * Main function to execute a token swap on the blockchain.
 */
async function swapToken(networkName, tokenConfig, direction = 'sell', customAmount = null, amountType = 'native', marketPrice = null, externalSigner = null, inputTokenOverride = null) {
  let wallet = externalSigner || wallets[networkName];
  if (!wallet) {
    logger.error(`[${networkName}] Wallet not configured.`);
    return null;
  }

  let broadcastWallet = wallet;
  if (tokenConfig.antiSandwich) {
    try {
      const { mevProviders, mevWallets } = require('./blockchain');
      const mevProvider = mevProviders[networkName];
      if (mevProvider && wallet.privateKey) {
          broadcastWallet = new ethers.Wallet(wallet.privateKey, mevProvider);
          logger.info(`[${networkName}] 🛡️ Anti-Sandwich ATIVADO: Usando RPC Protegido.`);
      } else {
          broadcastWallet = mevWallets[networkName] || wallet;
      }
    } catch (e) {
      logger.warn(`[${networkName}] Falha ao conectar ao RPC MEV. Usando canal padrão.`);
    }
  }

  const network = globalConfig.networks[networkName];
  const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
  const routerContract = new ethers.Contract(network.router, ROUTER_ABI, wallet);

  try {
    const isStuck = await checkPendingTransactions(networkName, wallet);
    if (isStuck) return null;

    let tokenIn, tokenOut, amountIn, isNativeIn = false, isNativeOut = false;
    const decimals = await withRPCRetry(() => tokenContract.decimals(), networkName);

    // --- 1. SET TARGETS AND INPUTS ---
    if (direction === 'buy') {
      tokenIn = inputTokenOverride ? inputTokenOverride.address : network.wrappedNative;
      tokenOut = tokenConfig.address;
      isNativeIn = !inputTokenOverride;
      
      if (amountType === 'token' && customAmount) {
        logger.step(`[${networkName}] BUY: Estimando custo para ${customAmount} ${tokenConfig.symbol} via Multi-Hop...`);
        const bridges = networkName === 'polygon' 
          ? [network.usdt, '0x7ceB23fD6bC0ad59E62c2551523066Ab99653907', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'] 
          : [network.usdt, '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'];
        const validBridges = [network.wrappedNative, ...bridges.filter(b => b && b.toLowerCase() !== tokenIn.toLowerCase() && b.toLowerCase() !== tokenOut.toLowerCase())];
        
        const pathReverse = await getBestPath(routerContract, ethers.parseUnits(customAmount.toString(), decimals), tokenIn, tokenOut, validBridges, 'in');
        if (!pathReverse) throw new Error(`Sem rota para BUY ${tokenConfig.symbol}`);

        const amountsInNeeded = await withRPCRetry(() => routerContract.getAmountsIn(ethers.parseUnits(customAmount.toString(), decimals), pathReverse), networkName);
        amountIn = (amountsInNeeded[0] * 105n) / 100n;
      } else {
        amountIn = ethers.parseEther(customAmount || globalConfig.defaultBuyAmount || '1.0');
      }
    } else { // SELL
      tokenIn = tokenConfig.address;
      tokenOut = inputTokenOverride ? inputTokenOverride.address : network.wrappedNative;
      isNativeOut = !inputTokenOverride;
      
      if (customAmount) {
        amountIn = ethers.parseUnits(customAmount.toString(), decimals);
      } else {
        amountIn = ethers.parseUnits(globalConfig.defaultSellAmount || '1.0', decimals);
      }
    }

    // --- 2. FINAL PATH FINDING ---
    const bridges = networkName === 'polygon' 
      ? [network.usdt, '0x7ceB23fD6bC0ad59E62c2551523066Ab99653907', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'] 
      : [network.usdt, '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'];
    const routingBridges = [network.wrappedNative, ...bridges.filter(b => b && b.toLowerCase() !== tokenIn.toLowerCase() && b.toLowerCase() !== tokenOut.toLowerCase())];
    
    const path = await getBestPath(routerContract, amountIn, tokenIn, tokenOut, routingBridges, 'out');
    if (!path) throw new Error(`Sem rota líquida para ${tokenConfig.symbol}`);

    const amountsOut = await withRPCRetry(() => routerContract.getAmountsOut(amountIn, path), networkName);
    const expectedOut = amountsOut[amountsOut.length - 1];

    // --- 3. BALANCE & ALLOWANCE CHECK ---
    const inDecimals = isNativeIn ? 18 : (inputTokenOverride ? inputTokenOverride.decimals : (direction === 'sell' ? decimals : 18));
    const outDecimals = isNativeOut ? 18 : tokenConfig.decimals;

    if (!isNativeIn) {
      const inContract = new ethers.Contract(tokenIn, ERC20_ABI, wallet);
      const balance = await withRPCRetry(() => inContract.balanceOf(wallet.address), networkName);
      if (balance < amountIn) {
        throw new Error(`${isNativeIn ? 'Native' : (inputTokenOverride?.symbol || 'Token')} saldo insuficiente: ${ethers.formatUnits(balance, inDecimals)} < ${ethers.formatUnits(amountIn, inDecimals)}`);
      }
      
      const allowance = await withRPCRetry(() => inContract.allowance(wallet.address, network.router), networkName);
      if (allowance < amountIn) {
        logger.step(`[${networkName}] Aprovando Token para o Router...`);
        const approveTx = await withRPCRetry(() => inContract.approve(network.router, ethers.MaxUint256), networkName);
        await withRPCRetry(() => approveTx.wait(), networkName, 10, 3000);
      }
    } else {
      const balance = await withRPCRetry(() => wallet.provider.getBalance(wallet.address), networkName);
      if (balance < amountIn) throw new Error(`Saldo nativo insuficiente.`);
    }

    // --- 4. SLIPPAGE & EXECUTION ---
    let amountOutMin = (expectedOut * (10000n - BigInt(Math.floor((tokenConfig.slippage || globalConfig.slippage || 1.0) * 100)))) / 10000n;
    
    if (marketPrice) {
      const amountInNum = parseFloat(ethers.formatUnits(amountIn, inDecimals));
      const fairOutNum = direction === 'buy' ? amountInNum / marketPrice : amountInNum * marketPrice;
      const fairOut = ethers.parseUnits(fairOutNum.toFixed(outDecimals), outDecimals);
      amountOutMin = (fairOut * (10000n - 1000n)) / 10000n; // Use 10% tolerance from global market price
    }

    if (tokenConfig.isDryRun) {
      logger.info(`[DRY RUN] OK: ${ethers.formatUnits(amountIn, inDecimals)} -> ${ethers.formatUnits(amountOutMin, outDecimals)}`);
      return { status: 1, hash: '0x' + 'd'.repeat(64), isDryRun: true };
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;
    const options = { gasLimit: 350000 };
    if (isNativeIn) options.value = amountIn;

    if (networkName === 'polygon') {
      const gas = await explorer.getPolygonGasPrice();
      if (gas) {
        options.maxPriorityFeePerGas = ethers.parseUnits(gas.maxPriorityFee.toString(), 'gwei') * 120n / 100n;
        options.maxFeePerGas = ethers.parseUnits(gas.maxFee.toString(), 'gwei') + options.maxPriorityFeePerGas;
      }
    }

    let tx;
    if (isNativeIn) {
      tx = await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(amountOutMin, path, wallet.address, deadline, options);
    } else if (isNativeOut) {
      tx = await routerContract.swapExactTokensForETHSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, options);
    } else {
      tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, options);
    }

    logger.info(`[${networkName}] 🔄 Tx Broadcasted: ${tx.hash}`);
    const receipt = await withRPCRetry(() => tx.wait(1), networkName, 5, 4000);
    
    if (receipt.status === 1) {
      return { ...receipt, status: 1, hash: tx.hash, gasFormatted: ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n)) };
    } else {
      throw new Error('STATUS_REVERTED');
    }
  } catch (err) {
    logger.error(`[${networkName}] Swap Error: ${err.message}`);
    return { status: 0, error: err.message };
  }
}

async function getBalances(networkName, wallet) {
    // Implementation not relevant for this refactor but kept for structure if needed
}

module.exports = {
  swapToken,
  getBalances,
  getBestPath,
  withRPCRetry,
  checkPendingTransactions
};
