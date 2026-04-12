const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { ethers } = require('ethers');
const config = require('../config');
const { wallets, mevWallets } = require('../services/blockchain');
const logger = require('./logger');
const explorer = require('./explorer');
const telegram = require('../services/telegram');

// Configuration
const NETWORK_NAME = 'polygon';
const USDT_ADDRESS = config.networks.polygon.usdt;
const SEN_ADDRESS = config.networks.polygon.tokens.find(t => t.symbol === 'SEN').address;
const ROUTER_ADDRESS = config.networks.polygon.router;
const WMATIC = config.networks.polygon.wrappedNative;

const BUY_AMOUNT_SEN = 1000;
const SLIPPAGE = config.slippage || 1.0; 
const TARGET_ADDRESS = '0x1674CD8445d4B0E2a4f69BB01Ba55318727BeE80';

const isDryRun = process.env.DRY_RUN === 'true' || config.strategy.dryRun || process.argv.includes('--dry-run');

// Colors for terminal logs
const fmt = {
  reset: "\x1b[0m", green: "\x1b[32m", yellow: "\x1b[33m", magenta: "\x1b[35m", cyan: "\x1b[36m", red: "\x1b[31m", gray: "\x1b[90m", white: "\x1b[37m"
};

/**
 * Simplified Recurring Buy Script
 */
async function run() {
  const wallet = wallets[NETWORK_NAME];
  const broadcastWallet = mevWallets[NETWORK_NAME] || wallet;

  if (!wallet) {
    logger.error(`[${NETWORK_NAME}] Wallet not configured.`);
    process.exit(1);
  }

  logger.info(`${fmt.magenta}=== SEN RECURRING BUY: 1000 SEN / 5 MIN ===${fmt.reset}`);
  logger.info(`Mode: ${isDryRun ? fmt.yellow + '[DRY RUN]' : fmt.green + '[LIVE]'}${fmt.reset} | Wallet: ${fmt.cyan}${wallet.address}${fmt.reset}`);
  
  const usdtContract = new ethers.Contract(USDT_ADDRESS, [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function allowance(address, address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)'
  ], wallet);

  const routerContract = new ethers.Contract(ROUTER_ADDRESS, [
    'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint, uint, address[], address, uint) external',
    'function getAmountsIn(uint, address[]) external view returns (uint[] memory)'
  ], wallet);

  while (true) {
    try {
      // 1. Check Balances
      const [matic, usdt, sen] = await Promise.all([
        wallet.provider.getBalance(wallet.address),
        usdtContract.balanceOf(wallet.address),
        new ethers.Contract(SEN_ADDRESS, ['function balanceOf(address) view returns (uint256)'], wallet).balanceOf(wallet.address)
      ]);

      const gasPrice = await explorer.getPolygonGasPrice();
      const gasFmt = gasPrice ? `${gasPrice.maxFee} gwei` : 'N/A';

      // Clean Dashboard
      console.log(`\n${fmt.gray}------------------------------------------------------------${fmt.reset}`);
      console.log(`${fmt.white}[${new Date().toLocaleTimeString()}] ${fmt.cyan}DASHBOARD STATUS${fmt.reset}`);
      console.log(`Saldo MATIC: ${fmt.yellow}${parseFloat(ethers.formatEther(matic)).toFixed(4)} MATIC${fmt.reset}`);
      console.log(`Saldo USDT : ${fmt.green}${parseFloat(ethers.formatUnits(usdt, 6)).toFixed(2)} USDT${fmt.reset}`);
      console.log(`Saldo SEN  : ${fmt.magenta}${parseFloat(ethers.formatEther(sen)).toFixed(2)} SEN${fmt.reset}`);
      console.log(`Gas Network: ${fmt.yellow}${gasFmt}${fmt.reset}`);
      console.log(`${fmt.gray}------------------------------------------------------------${fmt.reset}`);

      // 2. Price Calculation
      let path = [USDT_ADDRESS, SEN_ADDRESS];
      let amountIn;
      const expectedOut = ethers.parseEther(BUY_AMOUNT_SEN.toString());

      try {
        const amountsIn = await routerContract.getAmountsIn(expectedOut, path);
        amountIn = amountsIn[0];
      } catch (e) {
        path = [USDT_ADDRESS, WMATIC, SEN_ADDRESS];
        const amountsIn = await routerContract.getAmountsIn(expectedOut, path);
        amountIn = amountsIn[0];
      }
      
      const amountInFmt = parseFloat(ethers.formatUnits(amountIn, 6)).toFixed(4);
      logger.info(`Estimate: ~${fmt.green}${amountInFmt} USDT${fmt.reset} -> ${fmt.magenta}1000 SEN${fmt.reset}`);

      // 3. Execution Phase
      if (usdt < amountIn) {
        logger.warn(`${fmt.red}Insufficient USDT. Waiting next cycle.${fmt.reset}`);
      } else {
        if (isDryRun) {
          logger.info(`${fmt.yellow}[DRY RUN] Simulation successful. No transaction sent.${fmt.reset}`);
        } else {
          // Approve if needed
          const allowance = await usdtContract.allowance(wallet.address, ROUTER_ADDRESS);
          if (allowance < amountIn) {
            logger.info(`Approving USDT...`);
            await (await usdtContract.approve(ROUTER_ADDRESS, ethers.MaxUint256)).wait();
          }

          // Swap
          const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
          const options = { gasLimit: 250000 };
          if (gasPrice) {
            options.maxPriorityFeePerGas = ethers.parseUnits(gasPrice.maxPriorityFee.toString(), 'gwei');
            options.maxFeePerGas = ethers.parseUnits(gasPrice.maxFee.toString(), 'gwei');
          }

          const mevRouter = new ethers.Contract(ROUTER_ADDRESS, routerContract.interface, broadcastWallet);
          const tx = await mevRouter.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            amountIn,
            (expectedOut * (10000n - BigInt(Math.floor(SLIPPAGE * 100)))) / 10000n,
            path,
            wallet.address,
            deadline,
            options
          );

          logger.info(`${fmt.green}TX SENT: ${explorer.getExplorerLink(NETWORK_NAME, tx.hash)}${fmt.reset}`);
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            logger.info(`${fmt.green}BUY SUCCESSFUL: ${BUY_AMOUNT_SEN} SEN purchased.${fmt.reset}`);
            telegram.getInstance()?.sendMessage(`<b>✅ SEN Buy:</b> ${BUY_AMOUNT_SEN} SEN for ~${amountInFmt} USDT`);
          } else {
            logger.error(`${fmt.red}TX FAILED.${fmt.reset}`);
          }
        }
      }

      // 4. Asset Management (Transfer surplus to TARGET_ADDRESS)
      const finalSen = await new ethers.Contract(SEN_ADDRESS, ['function balanceOf(address) view returns (uint256)', 'function transfer(address, uint256) returns (bool)'], wallet).balanceOf(wallet.address);
      if (finalSen > ethers.parseEther("1000")) {
        const surplus = finalSen - ethers.parseEther("1000");
        logger.info(`${fmt.cyan}Asset Management: Surplus of ${fmt.magenta}${parseFloat(ethers.formatEther(surplus)).toFixed(2)} SEN${fmt.cyan} detected.${fmt.reset}`);
        
        if (isDryRun) {
          logger.info(`${fmt.yellow}[DRY RUN] Would transfer ${ethers.formatEther(surplus)} SEN to ${TARGET_ADDRESS}${fmt.reset}`);
        } else {
          logger.info(`Transferring surplus to ${fmt.cyan}${TARGET_ADDRESS}${fmt.reset}...`);
          const senContract = new ethers.Contract(SEN_ADDRESS, ['function transfer(address, uint256) returns (bool)'], wallet);
          const txTransfer = await senContract.transfer(TARGET_ADDRESS, surplus);
          await txTransfer.wait();
          logger.info(`${fmt.green}Transfer successful.${fmt.reset}`);
        }
      }
    } catch (error) {
      logger.error(`Loop error: ${error.message}`);
    }

    if (process.argv.includes('--once')) {
      logger.info(`Execution finished (--once).`);
      process.exit(0);
    }
    
logger.info(`Waiting for next cycle (50 minutes)...`);
await new Promise(r => setTimeout(r, 3000000));
  }
}

run().catch(err => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
