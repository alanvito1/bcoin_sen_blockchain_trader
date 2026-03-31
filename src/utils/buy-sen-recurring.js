require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../config');
const { wallets, mevWallets } = require('../services/blockchain');
const logger = require('./logger');
const explorer = require('./explorer');
const telegram = require('../services/telegram');

// Colors for terminal (Simple fallback since the main logger doesn't export them)
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  white: "\x1b[37m"
};

// ABIs
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];

const ROUTER_ABI = [
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

// Configuration
const NETWORK_NAME = 'polygon';
const USDT_ADDRESS = config.networks.polygon.usdt;
const SEN_ADDRESS = config.networks.polygon.tokens.find(t => t.symbol === 'SEN').address;
const ROUTER_ADDRESS = config.networks.polygon.router;
const BUY_AMOUNT_USD = 1.0;
const SLIPPAGE = config.slippage || 1.0; // 1%
const SEN_TRANSFER_THRESHOLD = 1000;
const SEN_RETAIN_AMOUNT = 100;
const TARGET_ADDRESS = '0x1674CD8445d4B0E2a4f69BB01Ba55318727BeE80';

// Check for DRY_RUN in env, config or cli flag
const isDryRun = process.env.DRY_RUN === 'true' || config.strategy.dryRun || process.argv.includes('--dry-run');

/**
 * Main function to execute the recurring buy
 */
async function executeRecurringBuy() {
  const wallet = wallets[NETWORK_NAME];
  const broadcastWallet = mevWallets[NETWORK_NAME] || wallet;

  if (!wallet) {
    logger.error(`[${NETWORK_NAME}] Carteira não configurada.`);
    process.exit(1);
  }

  logger.info(`${colors.magenta}=== INICIANDO BUY RECORRENTE: ${BUY_AMOUNT_USD} USDT -> SEN (Polygon) ===${colors.reset}`);
  logger.info(`Modo: ${isDryRun ? colors.yellow + '[DRY RUN]' : colors.green + '[REAL]'}${colors.reset}`);
  logger.info(`Carteira: ${wallet.address}`);
  
  const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, wallet);
  const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);
  const WMATIC = config.networks.polygon.wrappedNative;

  while (true) {
    try {
      const decimals = await usdtContract.decimals();
      const usdtBalance = await usdtContract.balanceOf(wallet.address);
      const balanceFormatted = parseFloat(ethers.formatUnits(usdtBalance, decimals)).toFixed(2);

      logger.info(`[${new Date().toLocaleTimeString()}] Saldo USDT: ${balanceFormatted}`);

      if (parseFloat(balanceFormatted) < BUY_AMOUNT_USD) {
        logger.warn(`Saldo USDT insuficiente (${balanceFormatted} < ${BUY_AMOUNT_USD}). Parando script.`);
        telegram.getInstance()?.sendMessage(`<b>⚠️ Compra Recorrente Parada</b>\nSaldo USDT insuficiente: ${balanceFormatted}`);
        break;
      }

      const amountIn = ethers.parseUnits(BUY_AMOUNT_USD.toString(), decimals);
      
      // We'll try direct route first, then bridge if it fails
      let path = [USDT_ADDRESS, SEN_ADDRESS];
      let expectedOut;

      try {
        const amountsOut = await routerContract.getAmountsOut(amountIn, path);
        expectedOut = amountsOut[amountsOut.length - 1];
      } catch (e) {
        logger.info(`Rota direta USDT->SEN não encontrada. Tentando via WMATIC...`);
        path = [USDT_ADDRESS, WMATIC, SEN_ADDRESS];
        const amountsOut = await routerContract.getAmountsOut(amountIn, path);
        expectedOut = amountsOut[amountsOut.length - 1];
      }
      const slippageBps = BigInt(Math.floor(SLIPPAGE * 100));
      const amountOutMin = (expectedOut * (10000n - slippageBps)) / 10000n;

      logger.info(`Estimando swap: ${BUY_AMOUNT_USD} USDT -> ~${ethers.formatEther(expectedOut)} SEN`);

      if (isDryRun) {
        logger.info(`${colors.yellow}[DRY RUN] Simulação OK. Seria enviada transação de ${BUY_AMOUNT_USD} USDT.${colors.reset}`);
      } else {
        // Check allowance
        const allowance = await usdtContract.allowance(wallet.address, ROUTER_ADDRESS);
        if (allowance < amountIn) {
          logger.info(`Aprovando USDT para o Router...`);
          const approveTx = await usdtContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
          await approveTx.wait();
          logger.info(`USDT aprovado.`);
        }

        // Prepare Transaction
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const gas = await explorer.getPolygonGasPrice();
        const options = { gasLimit: 250000 };
        
        if (gas) {
          options.maxPriorityFeePerGas = ethers.parseUnits(gas.maxPriorityFee.toString(), 'gwei');
          options.maxFeePerGas = ethers.parseUnits(gas.maxFee.toString(), 'gwei');
        }

        const mevRouter = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, broadcastWallet);
        const tx = await mevRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          amountIn,
          amountOutMin,
          path,
          wallet.address,
          deadline,
          options
        );

        logger.info(`Tx enviada: ${explorer.getExplorerLink(NETWORK_NAME, tx.hash)}`);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
          logger.info(`Compra de ${BUY_AMOUNT_USD} USDT realizada com sucesso!`);
          telegram.getInstance()?.sendMessage(`<b>✅ Compra Recorrente SEN</b>\n<b>Gasto:</b> ${BUY_AMOUNT_USD} USDT\n<b>Recebido:</b> ~${ethers.formatEther(expectedOut)} SEN\n<a href="${explorer.getExplorerLink(NETWORK_NAME, tx.hash)}">Ver Explorer</a>`);
        } else {
          logger.error(`Falha na transação.`);
        }
      }

      // 2. CHECK SEN BALANCE FOR AUTO-TRANSFER
      const senContract = new ethers.Contract(SEN_ADDRESS, ERC20_ABI, wallet);
      const senBalance = await senContract.balanceOf(wallet.address);
      const senFormatted = parseFloat(ethers.formatEther(senBalance));

      logger.info(`Saldo SEN atual: ${senFormatted.toFixed(2)}`);

      if (senFormatted >= SEN_TRANSFER_THRESHOLD) {
        logger.info(`${colors.cyan}Mecanismo de transferência ativado! Saldo SEN (${senFormatted.toFixed(2)}) > ${SEN_TRANSFER_THRESHOLD}${colors.reset}`);
        
        if (isDryRun) {
          const amountToTransfer = senFormatted - SEN_RETAIN_AMOUNT;
          logger.info(`${colors.yellow}[DRY RUN] Simulação OK. Seria transferido ${amountToTransfer.toFixed(2)} SEN para ${TARGET_ADDRESS} (mantendo ${SEN_RETAIN_AMOUNT}).${colors.reset}`);
        } else {
          const amountToTransfer = senBalance - ethers.parseEther(SEN_RETAIN_AMOUNT.toString());
          logger.info(`Transferindo ${ethers.formatEther(amountToTransfer)} SEN para ${TARGET_ADDRESS} (mantendo ${SEN_RETAIN_AMOUNT})...`);
          
          const options = { gasLimit: 100000 };
          const gas = await explorer.getPolygonGasPrice();
          if (gas) {
            options.maxPriorityFeePerGas = ethers.parseUnits(gas.maxPriorityFee.toString(), 'gwei');
            options.maxFeePerGas = ethers.parseUnits(gas.maxFee.toString(), 'gwei');
          }

          const txTransfer = await senContract.transfer(TARGET_ADDRESS, amountToTransfer, options);
          logger.info(`Tx transferência enviada: ${explorer.getExplorerLink(NETWORK_NAME, txTransfer.hash)}`);
          const receiptTransfer = await txTransfer.wait();

          if (receiptTransfer.status === 1) {
            logger.info(`Transferência de ${ethers.formatEther(amountToTransfer)} SEN concluída com sucesso! (Mantido ${SEN_RETAIN_AMOUNT} SEN na conta)`);
            telegram.getInstance()?.sendMessage(`<b>📤 SEN Transferido Automático</b>\n<b>Qtd:</b> ${ethers.formatEther(amountToTransfer)} SEN\n<b>Destino:</b> <code>${TARGET_ADDRESS}</code>\n<b>Obs:</b> Mantido ${SEN_RETAIN_AMOUNT} SEN na carteira.`);
          } else {
            logger.error(`Falha na transferência de SEN.`);
          }
        }
      }

    } catch (error) {
      logger.error(`Erro no loop de compra: ${error.message}`);
    }

    logger.info(`Aguardando 60 segundos para a próxima compra...`);
    
    // Support --once flag for single-shot testing
    if (process.argv.includes('--once')) {
      logger.info(`Script executado no modo --once. Encerrando.`);
      process.exit(0);
    }

    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}

// Execute
executeRecurringBuy().catch(err => {
  logger.error(`Erro fatal: ${err.message}`);
  process.exit(1);
});
