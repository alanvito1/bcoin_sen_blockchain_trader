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
    logger.warn(`[${networkName}] Detected ${diff} PENDING transaction(s). Queue is stuck.`);
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
    logger.info(`[PathFinder] ⚠️ Direct Route insufficient. Activating Triangular Route via ${bridgeSymbol} (${mode.toUpperCase()}).`);
  } else if (!bestPath) {
    // Zero-Friction Fallback (MetaMask style): If all bridges failed, try direct In->Out even if liquidation is unknown.
    logger.warn(`[PathFinder] 📉 All bridge routes failed. Forcing Direct Route to avoid blockage.`);
    bestPath = [tokenIn, tokenOut];
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
          logger.info(`[${networkName}] 🛡️ Anti-Sandwich ENABLED: Using Protected RPC.`);
      } else {
          broadcastWallet = mevWallets[networkName] || wallet;
      }
    } catch (e) {
      logger.warn(`[${networkName}] Failed to connect to MEV RPC. Using standard channel.`);
    }
  }

  const network = globalConfig.networks[networkName];
  const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
  const routerContract = new ethers.Contract(network.router, ROUTER_ABI, wallet);

  const NATIVE_ADDR = '0x0000000000000000000000000000000000000000';
  let tokenIn, tokenOut, amountIn, isNativeIn = false, isNativeOut = false;
  try {
    const isStuck = await checkPendingTransactions(networkName, wallet);
    if (isStuck) return null;

    const decimals = await withRPCRetry(() => tokenContract.decimals(), networkName);

    // --- 1. SET TARGETS AND INPUTS (POL/BNB Native Normalization) ---
    if (direction === 'buy') {
      tokenIn = inputTokenOverride ? inputTokenOverride.address : network.wrappedNative;
      tokenOut = tokenConfig.address;
      isNativeIn = !inputTokenOverride || inputTokenOverride.address === NATIVE_ADDR;
      
      // Force Wrapped for pathing
      if (tokenIn === NATIVE_ADDR) tokenIn = network.wrappedNative;

      if (amountType === 'token' && customAmount) {
        logger.step(`[${networkName}] BUY: Estimating cost for ${customAmount} ${tokenConfig.symbol} via Multi-Hop...`);
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
      isNativeOut = !inputTokenOverride || inputTokenOverride.address === NATIVE_ADDR;
      
      // Force Wrapped for pathing
      if (tokenOut === NATIVE_ADDR) tokenOut = network.wrappedNative;

      if (customAmount) {
        amountIn = ethers.parseUnits(customAmount.toString(), decimals);
      } else {
        amountIn = ethers.parseUnits(globalConfig.defaultSellAmount || '1.0', decimals);
      }
    }

    // --- 2. FINAL PATH FINDING (Smart Pool Analysis) ---
    const bridges = networkName === 'polygon' 
      ? [
          network.usdt, 
          '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC (PoS)
          '0x8f3Cf7ad107F03473D6612c2e12831115f7e8f3d', // DAI
          '0x7ceB23fD6bC0ad59E62c2551523066Ab99653907'  // WETH
        ] 
      : [
          network.usdt,
          '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
          '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', // DAI
          '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'  // BUSD
        ];
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
        const symbolIn = isNativeIn ? blockchainProviders[networkName].nativeSymbol : (direction === 'sell' ? tokenConfig.symbol : (inputTokenOverride?.symbol || 'Token'));
        throw new Error(`${symbolIn} saldo insuficiente: ${ethers.formatUnits(balance, inDecimals)} < ${ethers.formatUnits(amountIn, inDecimals)}`);
      }
      
      const allowance = await withRPCRetry(() => inContract.allowance(wallet.address, network.router), networkName);
      if (allowance < amountIn) {
        logger.step(`[${networkName}] Approving Token for Router...`);
        const approveTx = await withRPCRetry(() => inContract.approve(network.router, ethers.MaxUint256), networkName);
        await withRPCRetry(() => approveTx.wait(), networkName, 10, 3000);
      }
    } else {
      const balance = await withRPCRetry(() => wallet.provider.getBalance(wallet.address), networkName);
      if (balance < amountIn) throw new Error(`Insufficient native balance.`);
    }

    // --- 4. PERFECT SWAPPER: SLIPPAGE & DIVERGENCE GUARD ---
    // O Padro Gold é basear o slippage na Simulação Real (Pool), validando contra o Oráculo.
    const userSlippage = BigInt(Math.floor((tokenConfig.slippage || globalConfig.slippage || 1.0) * 100));
    let amountOutMin = (expectedOut * (10000n - userSlippage)) / 10000n;

    if (marketPrice) {
      const amountInNum = parseFloat(ethers.formatUnits(amountIn, inDecimals));
      const fairOutNum = direction === 'buy' ? amountInNum / marketPrice : amountInNum * marketPrice;
      const fairOut = ethers.parseUnits(fairOutNum.toFixed(outDecimals), outDecimals);
      
      // Cálculo de Divergência (DEX vs Oráculo)
      const drift = expectedOut > fairOut 
        ? (expectedOut - fairOut) * 10000n / fairOut 
        : (fairOut - expectedOut) * 10000n / fairOut;
      
      logger.debug(`[${networkName}] DEX vs Oracle Price: Drift of ${(Number(drift)/100).toFixed(2)}%`);

      // Abort if the Pool is > 5% different from Oracle (Prevents Price Impact / Lagging Oracle)
      if (drift > 500n) {
        const isSafe = globalConfig.projectSafeTokens.includes(tokenConfig.symbol);
        const shieldEnabled = globalConfig.enableSafetyShields !== false;

        if (isSafe || !shieldEnabled) {
          logger.warn(`[${networkName}] ⚠️ PRICE DIVERGENCE (${(Number(drift)/100).toFixed(2)}%): Project Token detected. Proceeding with 'Free Swap'.`);
        } else {
          throw new Error(`PRICE_DIVERGENCE: Pool is ${(Number(drift)/100).toFixed(2)}% off Oracle. Aborting for safety.`);
        }
      }
    }

    if (tokenConfig.isDryRun) {
      logger.info(`[DRY RUN] OK: ${ethers.formatUnits(amountIn, inDecimals)} -> ${ethers.formatUnits(amountOutMin, outDecimals)}`);
      return { status: 1, hash: '0x' + 'd'.repeat(64), isDryRun: true };
    }

    const deadline = Math.floor(Date.now() / 1000) + 1200;
    const baseOptions = {};
    if (isNativeIn) baseOptions.value = amountIn;

    const priorityMode = tokenConfig.priorityMode || 'Standard';
    
    if (networkName === 'polygon') {
      const gas = await explorer.getPolygonGasPrice();
      if (gas) {
        // Multiplier based on priorityMode
        const multiplier = priorityMode === 'Aggressive' ? 150n : 110n;
        baseOptions.maxPriorityFeePerGas = (ethers.parseUnits(gas.maxPriorityFee.toString(), 'gwei') * multiplier) / 100n;
        baseOptions.maxFeePerGas = (ethers.parseUnits(gas.maxFee.toString(), 'gwei') * multiplier) / 100n;
      }
    } else if (networkName === 'bsc') {
      const standardGas = await blockchainProviders[networkName].getFeeData();
      if (standardGas.gasPrice) {
        const multiplier = priorityMode === 'Aggressive' ? 150n : 110n;
        baseOptions.gasPrice = (standardGas.gasPrice * multiplier) / 100n;
      }
    }

    // SIMULATION GATE (MetaMask Pattern)
    logger.step(`[${networkName}] Simulating transaction (MetaMask Pattern)...`);
    let gasLimit;
    try {
      const estimate = async (p = path) => {
        if (isNativeIn) return routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens.estimateGas(amountOutMin, p, wallet.address, deadline, baseOptions);
        if (isNativeOut) return routerContract.swapExactTokensForETHSupportingFeeOnTransferTokens.estimateGas(amountIn, amountOutMin, p, wallet.address, deadline, baseOptions);
        return routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens.estimateGas(amountIn, amountOutMin, p, wallet.address, deadline, baseOptions);
      };

      try {
        const estimated = await withRPCRetry(() => estimate(), networkName);
        gasLimit = (estimated * 130n) / 100n; // 30% Buffer
        logger.info(`[${networkName}] ✅ Simulação Sucesso (Rota Direta). Gás Estimado (+30%): ${gasLimit.toString()}`);

        // --- 5. ANTI-HONEYPOT SHIELD (Pre-flight Sell Simulation) ---
        if (direction === 'buy' && !tokenConfig.isDryRun) {
            logger.debug(`[${networkName}] Shield: Simulating strategic exit (Anti-Honeypot)...`);
            try {
                const sellPath = [...path].reverse();
                const minUnit = 1n; 
                await withRPCRetry(() => routerContract.swapExactTokensForETHSupportingFeeOnTransferTokens.staticCall(
                    minUnit, 0, sellPath, wallet.address, deadline
                ), networkName).catch(() => {
                    return withRPCRetry(() => routerContract.swapExactTokensForETH.staticCall(
                        minUnit, 0, sellPath, wallet.address, deadline
                    ), networkName);
                });
                logger.debug(`[${networkName}] Shield: ✅ Token sellable (Authorized exit).`);
            } catch (hError) {
                const isSafe = globalConfig.projectSafeTokens.includes(tokenConfig.symbol);
                const shieldEnabled = globalConfig.enableSafetyShields !== false;

                if (isSafe || !shieldEnabled) {
                    logger.warn(`[${networkName}] 🛡️ SECURITY ALERT: Sell simulation failed for ${tokenConfig.symbol}. Project Token detected - Proceeding with 'Free Swap'.`);
                } else {
                    throw new Error(`HONEYPOT_DETECTED: Failed to simulate sell. Token might be a Honeypot.`);
                }
            }
        }
      } catch (simError) {
        logger.warn(`[${networkName}] ⚠️ Simulação FALHOU na Rota Direita: ${simError.message}`);
        
        // Fallback to Triangular Route if available and not already used
        if (path.length === 2 && routingBridges.length > 0) {
            logger.step(`[${networkName}] 🔄 Attempting Fallback to Triangular Route via Simulation...`);
            const altPath = await getBestPath(routerContract, amountIn, tokenIn, tokenOut, routingBridges.filter(b => b.toLowerCase() !== network.wrappedNative.toLowerCase()), 'out');
            
            if (altPath && altPath.length > 2) {
                const altEstimated = await withRPCRetry(() => estimate(altPath), networkName);
                gasLimit = (altEstimated * 130n) / 100n;
                path.splice(0, path.length, ...altPath); // Update path in-place
                logger.info(`[${networkName}] ✅ Simulation Success (TRIANGULAR ROUTE). Estimated Gas (+30%): ${gasLimit.toString()}`);
            } else {
                throw new Error(`Both routes failed in simulation (Liquidity/Price Impact). Original error: ${simError.message}`);
            }
        } else {
            throw simError;
        }
      }
    } catch (finalSimError) {
      throw new Error(`[SIMULATION_FAILED] Transaction would fail on Blockchain: ${finalSimError.message}`);
    }

    const txOptions = { ...baseOptions, gasLimit };
    let tx;
    let broadcastAttempts = 0;
    const maxBroadcastAttempts = 2;

    while (broadcastAttempts < maxBroadcastAttempts) {
      try {
        const currentOptions = { ...txOptions };
        if (broadcastAttempts > 0) {
          // Agressive Gas Bump for Retry (20% increase)
          if (currentOptions.maxPriorityFeePerGas) currentOptions.maxPriorityFeePerGas = (currentOptions.maxPriorityFeePerGas * 120n) / 100n;
          if (currentOptions.maxFeePerGas) currentOptions.maxFeePerGas = (currentOptions.maxFeePerGas * 120n) / 100n;
          if (currentOptions.gasPrice) currentOptions.gasPrice = (currentOptions.gasPrice * 120n) / 100n;
          logger.warn(`[${networkName}] ⛽ Bumping GAS for Retry (+20%). Attempt ${broadcastAttempts + 1}`);
        }

        if (isNativeIn) {
          tx = await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(amountOutMin, path, wallet.address, deadline, currentOptions);
        } else if (isNativeOut) {
          tx = await routerContract.swapExactTokensForETHSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, currentOptions);
        } else {
          tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, currentOptions);
        }
        break; // Success
      } catch (broadcastErr) {
        broadcastAttempts++;
        const isUnderpriced = broadcastErr.message.includes('underpriced') || broadcastErr.message.includes('low priority');
        if (broadcastAttempts < maxBroadcastAttempts && isUnderpriced) {
          continue;
        }
        throw broadcastErr;
      }
    }

    logger.info(`[${networkName}] 🔄 Tx Broadcasted (MetaMask Standard): ${tx.hash}`);
    const receipt = await withRPCRetry(() => tx.wait(1), networkName, 5, 4000);
    
    if (receipt.status === 1) {
      const pathLabels = (tokenIn && inputTokenOverride?.address) ? (direction === 'buy' ? `USDT ➔ ${tokenConfig.symbol}` : `${tokenConfig.symbol} ➔ USDT`) : 'Direct';
      return { 
          ...receipt, 
          status: 1, 
          hash: tx.hash, 
          gasFormatted: ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || 0n)),
          path: pathLabels
      };
    } else {
      throw new Error('STATUS_REVERTED');
    }
  } catch (err) {
    logger.error(`[${networkName}] Swap Error: ${err.message}`);
    
    // Extract path for transparency (Safely check for defined variables)
    const pathLabels = (typeof tokenIn !== 'undefined' && inputTokenOverride?.address) 
        ? (direction === 'buy' ? `USDT ➔ ${tokenConfig.symbol}` : `${tokenConfig.symbol} ➔ USDT`) 
        : 'Direto';

    // Friendly error mapping for users
    let friendlyError = err.message;
    if (err.message.includes('INSUFFICIENT_OUTPUT_AMOUNT')) {
        friendlyError = 'Slippage exceeded: Price moved too fast during processing.';
    } else if (err.message.includes('INSUFFICIENT_LIQUIDITY') || err.message.includes('No route')) {
        friendlyError = 'Insufficient liquidity in the market for this pair.';
    } else if (err.message.includes('TRANSFER_FROM_FAILED')) {
        friendlyError = 'Failed to transfer tokens (Might be a high tax or contract protection).';
    } else if (err.message.includes('gas required exceeds allowance') || err.message.includes('insufficient funds for gas')) {
        friendlyError = `Insufficient ${network.nativeSymbol} balance to pay network fees (Gas).`;
    }

    return { 
        status: 0, 
        error: friendlyError, 
        originalError: err.message,
        path: pathLabels
    };
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
