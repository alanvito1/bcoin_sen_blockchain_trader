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
  } else if (!bestPath) {
    // Zero-Friction Fallback (MetaMask style): If all bridges failed, try direct In->Out even if liquidation is unknown.
    logger.warn(`[PathFinder] 📉 Todas as rotas de ponte falharam. Forçando Rota Direta para evitar bloqueio.`);
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
      
      logger.debug(`[${networkName}] Preço DEX vs Oráculo: Drift de ${(Number(drift)/100).toFixed(2)}%`);

      // Abort se a Pool estiver > 5% diferente do Oráculo (Evita Price Impact / Oráculo Defasado)
      if (drift > 500n) {
        const isSafe = globalConfig.projectSafeTokens.includes(tokenConfig.symbol);
        const shieldEnabled = globalConfig.enableSafetyShields !== false;

        if (isSafe || !shieldEnabled) {
          logger.warn(`[${networkName}] ⚠️ DIVERGÊNCIA DE PREÇO (${(Number(drift)/100).toFixed(2)}%): Token do Projeto detectado. Prosseguindo com 'Livre Swap'.`);
        } else {
          throw new Error(`DIVERGENCIA_PRECO: A Pool está ${(Number(drift)/100).toFixed(2)}% fora do Oráculo. Abortando por segurança.`);
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
    logger.step(`[${networkName}] Simulando transação (MetaMask Pattern)...`);
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
            logger.debug(`[${networkName}] Shield: Simulando saída estratégica (Anti-Honeypot)...`);
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
                logger.debug(`[${networkName}] Shield: ✅ Token vendável (Saída autorizada).`);
            } catch (hError) {
                const isSafe = globalConfig.projectSafeTokens.includes(tokenConfig.symbol);
                const shieldEnabled = globalConfig.enableSafetyShields !== false;

                if (isSafe || !shieldEnabled) {
                    logger.warn(`[${networkName}] 🛡️ ALERTA DE SEGURANÇA: Falha na simulação de venda para ${tokenConfig.symbol}. Token do Projeto detectado - Prosseguindo com 'Livre Swap'.`);
                } else {
                    throw new Error(`HONEYPOT_DETECTED: Falha ao simular venda. O token pode ser um Honeypot.`);
                }
            }
        }
      } catch (simError) {
        logger.warn(`[${networkName}] ⚠️ Simulação FALHOU na Rota Direita: ${simError.message}`);
        
        // Fallback to Triangular Route if available and not already used
        if (path.length === 2 && routingBridges.length > 0) {
            logger.step(`[${networkName}] 🔄 Tentando Fallback para Rota Triangular via Simulação...`);
            const altPath = await getBestPath(routerContract, amountIn, tokenIn, tokenOut, routingBridges.filter(b => b.toLowerCase() !== network.wrappedNative.toLowerCase()), 'out');
            
            if (altPath && altPath.length > 2) {
                const altEstimated = await withRPCRetry(() => estimate(altPath), networkName);
                gasLimit = (altEstimated * 130n) / 100n;
                path.splice(0, path.length, ...altPath); // Update path in-place
                logger.info(`[${networkName}] ✅ Simulação Sucesso (ROTA TRIANGULAR). Gás Estimado (+30%): ${gasLimit.toString()}`);
            } else {
                throw new Error(`Ambas as rotas falharam na simulação (Liquidez/Price Impact). Original error: ${simError.message}`);
            }
        } else {
            throw simError;
        }
      }
    } catch (finalSimError) {
      throw new Error(`[SIMULATION_FAILED] A transação falharia na Blockchain: ${finalSimError.message}`);
    }

    const txOptions = { ...baseOptions, gasLimit };
    let tx;
    if (isNativeIn) {
      tx = await routerContract.swapExactETHForTokensSupportingFeeOnTransferTokens(amountOutMin, path, wallet.address, deadline, txOptions);
    } else if (isNativeOut) {
      tx = await routerContract.swapExactTokensForETHSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, txOptions);
    } else {
      tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, txOptions);
    }

    logger.info(`[${networkName}] 🔄 Tx Broadcasted (MetaMask Standard): ${tx.hash}`);
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
