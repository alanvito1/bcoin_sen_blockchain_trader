const { Wallet, JsonRpcProvider, Contract, parseUnits } = require('ethers');
const prisma = require('../config/prisma');
const encryption = require('../utils/encryption');
const { getOrCreateTransitWallet } = require('./walletService');
const { Queue } = require('bullmq');
const redisConnection = require('../config/redis');

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() view returns (uint8)"
];

const ADMIN_MASTER_WALLET = process.env.ADMIN_MASTER_WALLET;
const { providers } = require('./blockchain');

const payoutQueue = new Queue('payoutQueue', { connection: redisConnection });
const DECIMAL_CACHE = new Map();

/**
 * Helper to get token decimals with caching
 */
async function getTokenDecimals(tokenAddress, signer) {
  if (DECIMAL_CACHE.has(tokenAddress)) return DECIMAL_CACHE.get(tokenAddress);
  
  const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
  const decimals = await tokenContract.decimals();
  DECIMAL_CACHE.set(tokenAddress, decimals);
  return decimals;
}

/**
 * Executes a payment from the user's bot wallet to the TRANSIT wallet.
 * Then queues a split payout (Admin + Referrer).
 */
async function processCheckout(userId, type, amount, tokenAddress = null, networkOverride = null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true, referredBy: true }
  });

  if (!user || !user.wallet) throw new Error('User wallet not found.');
  if (!ADMIN_MASTER_WALLET) throw new Error('ADMIN_MASTER_WALLET is not configured.');

  // 0. Get or Create Transit Wallet
  const transit = await getOrCreateTransitWallet();

  // 1. Setup Network and Provider
  const network = (networkOverride || user.wallet.network).toUpperCase();
  const provider = providers[network.toLowerCase()];
  if (!provider) throw new Error(`Provider para ${network} não encontrado.`);

  // 2. Decrypt Private Key
  const privateKey = encryption.decrypt({
    encryptedData: user.wallet.encryptedPrivateKey,
    iv: user.wallet.iv,
    authTag: user.wallet.authTag
  });

  const signer = new Wallet(privateKey, provider);

  try {
    let tx;
    let amountWei;

    // 3. Execute Transfer to Transit Wallet
    if (type === 'NATIVE') {
      amountWei = parseUnits(amount.toString(), 18);
      tx = await signer.sendTransaction({ to: transit.address, value: amountWei });
    } else if (type === 'TOKEN') {
      const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
      const decimals = await getTokenDecimals(tokenAddress, signer);
      amountWei = parseUnits(amount.toString(), decimals);
      tx = await tokenContract.transfer(transit.address, amountWei);
    }

    const receipt = await tx.wait(1);
    
    // 4. Create Payout Log (Audit)
    const payoutLog = await prisma.payoutLog.create({
      data: {
        buyerId: user.id,
        referrerId: user.referredById,
        network: network,
        amountGross: parseFloat(amount),
        status: 'PENDING'
      }
    });

    // 5. Queue the Split Job
    await payoutQueue.add('processSplit', {
      payoutLogId: payoutLog.id,
      amount: amount.toString(),
      type: type,
      tokenAddress: tokenAddress,
      network: network,
      referrerId: user.referredById
    });

    return receipt.hash;
  } catch (error) {
    console.error(`[PaymentService] Transaction failed on ${network}:`, error.message);
    throw error;
  }
}

module.exports = {
  processCheckout
};
