/**
 * @file payoutWorker.js
 * @description Background worker that handles automated split payouts from the Transit Wallet.
 * Implements aggressive gas pricing for instant confirmations and logs every step to the DB.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { Worker } = require('bullmq');
const { Wallet, Contract, parseUnits, formatUnits } = require('ethers');
const prisma = require('../config/prisma');
const redisConnection = require('../config/redis');
const { getOrCreateTransitWallet } = require('../services/walletService');
const { providers } = require('../services/blockchain');
const logger = require('../utils/logger');

const ADMIN_MASTER_WALLET = process.env.ADMIN_MASTER_WALLET;

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() view returns (uint8)"
];

/**
 * Calculates aggressive gas parameters for EIP-1559 or Legacy transactions.
 */
async function getAggressiveGas(provider) {
  const feeData = await provider.getFeeData();
  
  // High Priority: 2x faster than standard
  const boost = (val) => val ? (val * 150n) / 100n : null; // 50% buffer

  return {
    maxFeePerGas: boost(feeData.maxFeePerGas),
    maxPriorityFeePerGas: boost(feeData.maxPriorityFeePerGas),
    gasPrice: boost(feeData.gasPrice)
  };
}

async function processSplit(job) {
  const { payoutLogId, amount, type, tokenAddress, network, referrerId } = job.data;
  logger.info(`[PayoutWorker] Processing split for PayoutLog: ${payoutLogId} on ${network}`);

  try {
    const provider = providers[network.toLowerCase()];
    if (!provider) throw new Error(`Provider for ${network} not found`);

    const { privateKey } = await getOrCreateTransitWallet();
    const signer = new Wallet(privateKey, provider);

    const user = await prisma.user.findUnique({ where: { id: job.data.buyerId || '' } }); // Not passed in job, but we have payoutLog
    const payoutLog = await prisma.payoutLog.findUnique({ where: { id: payoutLogId } });
    
    let referrer = null;
    if (referrerId) {
      referrer = await prisma.user.findUnique({ where: { id: referrerId } });
    }

    const commissionRate = referrer ? (referrer.commissionRate || 0.10) : 0;
    const gasParams = await getAggressiveGas(provider);

    let decimals = 18;
    let tokenContract = null;
    if (type === 'TOKEN') {
      tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
      decimals = await tokenContract.decimals();
    }

    const totalWei = parseUnits(amount, decimals);
    
    // Estimate Gas for 2 transfers (even if simple, we need a baseline)
    const nativeGasPrice = (await provider.getFeeData()).gasPrice || 20000000000n; // fallback 20 gwei
    const estGasValue = nativeGasPrice * 21000n * 2n; // 2 simple transfers estimate
    const estGasFormatted = parseFloat(formatUnits(estGasValue, 18));

    let adminWei, refWei;
    let referrerNet = 0;
    let adminNet = parseFloat(amount);

    if (referrer && referrer.referralPayoutAddress) {
      const refPortion = (totalWei * BigInt(Math.floor(commissionRate * 100))) / 100n;
      refWei = refPortion;
      adminWei = totalWei - refWei;
      
      referrerNet = parseFloat(formatUnits(refWei, decimals));
      adminNet = parseFloat(formatUnits(adminWei, decimals));
    } else {
      adminWei = totalWei;
      refWei = 0n;
    }

    logger.info(`[PayoutWorker] Splitting ${amount} ${network}: Admin=${adminNet}, Referrer=${referrerNet}`);

    let hashes = [];

    // 1. Pay Referrer if applicable
    if (refWei > 0n && referrer.referralPayoutAddress) {
      logger.info(`[PayoutWorker] Sending ${referrerNet} to Referrer: ${referrer.referralPayoutAddress}`);
      let txRef;
      if (type === 'NATIVE') {
        txRef = await signer.sendTransaction({ to: referrer.referralPayoutAddress, value: refWei, ...gasParams });
      } else {
        txRef = await tokenContract.transfer(referrer.referralPayoutAddress, refWei, { ...gasParams });
      }
      await txRef.wait(1);
      hashes.push(txRef.hash);
    }

    // 2. Pay Admin
    logger.info(`[PayoutWorker] Sending ${adminNet} to Admin: ${ADMIN_MASTER_WALLET}`);
    let txAdmin;
    if (type === 'NATIVE') {
      txAdmin = await signer.sendTransaction({ to: ADMIN_MASTER_WALLET, value: adminWei, ...gasParams });
    } else {
      txAdmin = await tokenContract.transfer(ADMIN_MASTER_WALLET, adminWei, { ...gasParams });
    }
    await txAdmin.wait(1);
    hashes.push(txAdmin.hash);

    // 3. Update Log
    await prisma.payoutLog.update({
      where: { id: payoutLogId },
      data: {
        gasDeducted: estGasFormatted,
        adminNet: adminNet,
        referrerNet: referrerNet,
        payoutTxHash: hashes.join(','),
        status: 'SUCCESS'
      }
    });

    logger.info(`[PayoutWorker] Payout ${payoutLogId} completed successfully.`);

  } catch (error) {
    logger.error(`[PayoutWorker] Critical error processing PayoutLog ${payoutLogId}: ${error.message}`);
    await prisma.payoutLog.update({
      where: { id: payoutLogId },
      data: { status: 'FAILED' }
    }).catch(() => {});
    throw error; // Let BullMQ retry
  }
}

const payoutWorker = new Worker('payoutQueue', processSplit, {
  connection: redisConnection,
  concurrency: 10,
});

payoutWorker.on('failed', (job, err) => {
  logger.error(`[PayoutWorker] Job ${job.id} failed: ${err.message}`);
});

logger.info('[PayoutWorker] Started and listening to payoutQueue.');

module.exports = { payoutWorker };
