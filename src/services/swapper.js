const { ethers } = require('ethers');
const config = require('../config');
const { wallets, mevWallets } = require('./blockchain');
const explorer = require('../utils/explorer');
const logger = require('../utils/logger');
const telegram = require('./telegram');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

const ROUTER_ABI = [
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

/**
 * Helper to retry RPC calls on transient errors like "Unknown block"
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

async function getBestPath(routerContract, amountIn, tokenIn, tokenOut, bridgeTokens = []) {
  const paths = [[tokenIn, tokenOut]];
  for (const bridge of bridgeTokens) {
    if (bridge.toLowerCase() !== tokenIn.toLowerCase() && bridge.toLowerCase() !== tokenOut.toLowerCase()) {
      paths.push([tokenIn, bridge, tokenOut]);
    }
  }

  let bestPath = null;
  let maxAmount = 0n;

  for (const path of paths) {
    try {
      const amounts = await withRPCRetry(() => routerContract.getAmountsOut(amountIn, path), 'rpc-path');
      const out = amounts[amounts.length - 1];
      if (out > maxAmount) {
        maxAmount = out;
        bestPath = path;
      }
    } catch (e) {
      // Path not liquid
    }
  }
  return bestPath;
}

async function swapToken(networkName, tokenConfig, direction = 'sell', customAmount = null, amountType = 'native', marketPrice = null) {
  const wallet = wallets[networkName];
  if (!wallet) {
    logger.error(`[${networkName}] Wallet not configured.`);
    return;
  }

  const network = config.networks[networkName];
  const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
  const routerContract = new ethers.Contract(network.router, ROUTER_ABI, wallet);

  try {
    const isStuck = await checkPendingTransactions(networkName, wallet);
    if (isStuck) {
      logger.error(`[${networkName}] Não é seguro operar ${tokenConfig.symbol} com transações pendentes.`);
      return;
    }

    let tokenIn, tokenOut, amountIn, amountInFormatted;
    let isNativeIn = false;
    let isNativeOut = false;

      const decimals = await withRPCRetry(() => tokenContract.decimals(), networkName);
    
    if (direction === 'sell') {
      tokenIn = tokenConfig.address;
      tokenOut = network.wrappedNative;
      isNativeOut = true;

      if (customAmount) {
        amountIn = ethers.parseUnits(customAmount.toString(), decimals);
      } else {
        amountIn = ethers.parseUnits(tokenConfig.symbol === 'USDT' ? '10' : (config.defaultSellAmount || '1.0'), decimals);
      }
      amountInFormatted = ethers.formatUnits(amountIn, decimals);

      const balance = await withRPCRetry(() => tokenContract.balanceOf(wallet.address), networkName);
      if (balance < amountIn) {
        logger.warn(`[${networkName}] ${tokenConfig.symbol} saldo insuficiente: ${ethers.formatUnits(balance, decimals)} < ${amountInFormatted}`);
        return;
      }

      const allowance = await withRPCRetry(() => tokenContract.allowance(wallet.address, network.router), networkName);
      if (allowance < amountIn) {
        logger.step(`[${networkName}] Aprovando ${tokenConfig.symbol}...`);
        const approveTx = await withRPCRetry(() => tokenContract.approve(network.router, ethers.MaxUint256), networkName);
        await withRPCRetry(() => approveTx.wait(), networkName, 10, 3000);
      }
    } else {
      tokenIn = network.wrappedNative;
      tokenOut = tokenConfig.address;
      
      if (amountType === 'token' && customAmount) {
        logger.step(`[${networkName}] Estimando custo para ${customAmount} ${tokenConfig.symbol}...`);
        const pathReverse = [tokenOut, tokenIn];
        const amountsInNeeded = await withRPCRetry(() => routerContract.getAmountsOut(ethers.parseUnits(customAmount.toString(), decimals), pathReverse), networkName);
        amountIn = (amountsInNeeded[amountsInNeeded.length - 1] * 105n) / 100n; // Add 5% buffer
        isNativeIn = true;
      } else {
        amountIn = ethers.parseEther(customAmount || config.defaultBuyAmount || '1.0');
        isNativeIn = true;
      }
      
      amountInFormatted = ethers.formatEther(amountIn);

      const balance = await withRPCRetry(() => wallet.provider.getBalance(wallet.address), networkName);
      if (balance < amountIn) {
        logger.warn(`[${networkName}] Saldo nativo insuficiente: ${ethers.formatEther(balance)} < ${amountInFormatted}`);
        return;
      }
    }

    logger.info(`[${networkName}] 💸 Operação de ${direction.toUpperCase()} Enviada (${amountInFormatted} ${isNativeIn ? 'Native' : tokenConfig.symbol})`);
    
    const tg = telegram.getInstance();
    tg?.sendMessage(`<b>💸 Ordem Enviada (${networkName.toUpperCase()})</b>\n<b>Token:</b> ${tokenConfig.symbol}\n<b>Ação:</b> ${direction.toUpperCase()}\n<b>Qtd:</b> ${amountInFormatted} ${isNativeIn ? 'Native' : tokenConfig.symbol}`);

    const bridges = networkName === 'polygon' 
      ? [network.usdt, '0x7ceB23fD6bC0ad59E62c2551523066Ab99653907', '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6', '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', '0x8f3Cf7ad23Cd3BaBB3b0195a012d081919717075'] 
      : [network.usdt, '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', '0x2170Ed0880ac9A755fd29B2688956BD959f933F8', '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'];
    
    const validBridges = bridges.filter(b => b && b.toLowerCase() !== tokenConfig.address.toLowerCase());
    const path = await getBestPath(routerContract, amountIn, tokenIn, tokenOut, validBridges);
    
    if (path && path.length > 2) {
      logger.info(`[${networkName}] Rota multi-hop detectada: [Bridges usadas]`);
    }
    
    if (!path) {
      logger.error(`[${networkName}] Nenhuma rota líquida para ${tokenConfig.symbol}.`);
      return;
    }
    
    const amountsOut = await withRPCRetry(() => routerContract.getAmountsOut(amountIn, path), networkName);
    const expectedOut = amountsOut[amountsOut.length - 1];

    // --- Price Impact & Sandwich Protection ---
    if (marketPrice) {
      const amountInNum = parseFloat(ethers.formatUnits(amountIn, isNativeIn ? 18 : tokenConfig.decimals));
      const expectedOutNum = parseFloat(ethers.formatUnits(expectedOut, isNativeOut ? 18 : tokenConfig.decimals));
      
      if (isNaN(amountInNum) || isNaN(expectedOutNum)) {
        logger.error(`[${networkName}] Erro ao converter para Number: amountInNum=${amountInNum}, expectedOutNum=${expectedOutNum}`);
      }
      
      let fairOut;
      if (direction === 'buy') {
        fairOut = amountInNum / marketPrice;
      } else {
        fairOut = amountInNum * marketPrice;
      }

      const ratio = expectedOutNum / fairOut;
      const impact = (1 - ratio) * 100;

      if (ratio < 0.85) { // 15% deviation guard
        logger.error(`[${networkName}] ⚠️ ALERTA DE IMPACTO: Rota ruim ou possível Sandwich! Esperado: ${expectedOutNum.toFixed(4)} | Justo: ${fairOut.toFixed(4)} (${(impact || 0).toFixed(2)}% impact)`);
        if (!config.strategy.dryRun) return; // Abort live trade
      } else if (impact > 5) {
        logger.warn(`[${networkName}] Impacto de preço alto: ${(impact || 0).toFixed(2)}%`);
      }
    }

    const slippageBps = BigInt(Math.floor(config.slippage * 100));
    const amountOutMin = (expectedOut * (10000n - slippageBps)) / 10000n;

    if (config.strategy.dryRun) {
      logger.info(`${logger.colors.yellow}[DRY RUN] Simulação OK: ${amountInFormatted} ➔ ${ethers.formatUnits(amountOutMin, direction === 'buy' ? tokenConfig.decimals : 18)} output min.${logger.colors.reset}`);
      return;
    }

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    let overrideOptions = { gasLimit: 350000 };
    if (isNativeIn) overrideOptions.value = amountIn;

    if (networkName === 'polygon') {
      const gas = await explorer.getPolygonGasPrice();
      if (gas) {
        overrideOptions.maxPriorityFeePerGas = ethers.parseUnits(gas.maxPriorityFee.toString(), 'gwei');
        overrideOptions.maxFeePerGas = ethers.parseUnits(gas.maxFee.toString(), 'gwei');
      }
    }

    // Use MEV-protected wallet for broadcasting if available
    const broadcastWallet = mevWallets[networkName] || wallet;
    const mevRouterContract = new ethers.Contract(network.router, ROUTER_ABI, broadcastWallet);

    logger.info(`[${networkName}] Enviando transação de ${direction}...`);
    let tx;
    if (isNativeIn) {
      const routerBuy = new ethers.Contract(network.router, [
        ...ROUTER_ABI,
        'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable'
      ], broadcastWallet);
      tx = await withRPCRetry(() => routerBuy.swapExactETHForTokensSupportingFeeOnTransferTokens(amountOutMin, path, wallet.address, deadline, overrideOptions), networkName);
    } else if (isNativeOut) {
      const mevTokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, broadcastWallet);
      tx = await withRPCRetry(() => mevRouterContract.swapExactTokensForETHSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, overrideOptions), networkName);
    } else {
      tx = await withRPCRetry(() => mevRouterContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(amountIn, amountOutMin, path, wallet.address, deadline, overrideOptions), networkName);
    }

    logger.info(`[${networkName}] ✅ Tx Enviada: ${explorer.getExplorerLink(networkName, tx.hash)}`);
    // Increase retries for waiting for the receipt, as nodes might take time to sync "Unknown block"
    const receipt = await withRPCRetry(() => tx.wait(), networkName, 10, 3000);
    
    if (receipt.status === 1) {
      const gasUsed = receipt.gasUsed ?? 0n;
      // Robust fallback for gas price in v6
      const gasPricePaid = receipt.effectiveGasPrice ?? receipt.gasPrice ?? tx.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPricePaid;
      const gasFormatted = parseFloat(ethers.formatEther(gasCost)).toFixed(6);
      const nativeSymbol = networkName === 'polygon' ? 'POL' : 'BNB';
      logger.success(`[${networkName}] 🎊 Sucesso! (Gas: ${gasFormatted} ${nativeSymbol})`);
      telegram.getInstance()?.sendMessage(`<b>✅ Sucesso (${networkName.toUpperCase()})</b>\n<b>Token:</b> ${tokenConfig.symbol}\n<b>Gas:</b> ${gasFormatted} ${nativeSymbol}\n<a href="${explorer.getExplorerLink(networkName, tx.hash)}">Ver no Explorer</a>`);
    } else {
      logger.error(`[${networkName}] Falha na transação.`);
      telegram.getInstance()?.sendMessage(`<b>❌ Falha (${networkName.toUpperCase()})</b>\n<b>Token:</b> ${tokenConfig.symbol}\nTransação falhou na blockchain.`);
    }

  } catch (error) {
    logger.error(`Erro no ${tokenConfig.symbol}: ${error.message}`);
  }
}

async function getBalances(networkName) {
  const wallet = wallets[networkName];
  if (!wallet) return;

  const network = config.networks[networkName];
  const netColor = networkName === 'bsc' ? logger.colors.yellow : logger.colors.magenta;
  
  console.log(`\n  ${netColor}• ${networkName.toUpperCase()}${logger.colors.reset}`);
  
  try {
    const nativeBalance = await withRPCRetry(() => wallet.provider.getBalance(wallet.address), networkName);
    const nativeSymbol = networkName === 'polygon' ? 'POL' : 'BNB';
    console.log(`    ${logger.colors.gray}├─${logger.colors.reset} Native (${nativeSymbol}): ${logger.colors.white}${ethers.formatEther(nativeBalance)}${logger.colors.reset}`);

    for (const token of network.tokens) {
      if (token.symbol === 'USDT') continue;
      const tContract = new ethers.Contract(token.address, ERC20_ABI, wallet);
      const tBalance = await withRPCRetry(() => tContract.balanceOf(wallet.address), networkName);
      const formatted = ethers.formatUnits(tBalance, token.decimals);
      const isPositive = parseFloat(formatted) > 0;
      const color = isPositive ? logger.colors.green : logger.colors.gray;
      console.log(`    ${logger.colors.gray}├─${logger.colors.reset} ${token.symbol}: ${color}${formatted}${logger.colors.reset}`);
    }

    // USDT Check
    const usdtToken = network.tokens.find(t => t.symbol === 'USDT');
    if (usdtToken) {
      const uContract = new ethers.Contract(usdtToken.address, ERC20_ABI, wallet);
      const uBalance = await withRPCRetry(() => uContract.balanceOf(wallet.address), networkName);
      const uFormatted = ethers.formatUnits(uBalance, usdtToken.decimals);
      const uColor = parseFloat(uFormatted) > 0 ? logger.colors.green : logger.colors.gray;
      console.log(`    ${logger.colors.gray}└─${logger.colors.reset} USDT: ${uColor}${uFormatted}${logger.colors.reset}`);
    }
  } catch (error) {
    logger.error(`Erro ao buscar saldos: ${error.message}`);
  }
}

module.exports = {
  swapToken,
  getBalances
};
