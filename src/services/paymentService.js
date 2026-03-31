const { Wallet, JsonRpcProvider, Contract, parseUnits } = require('ethers');
const prisma = require('../config/prisma');
const encryption = require('../utils/encryption');

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() view returns (uint8)"
];

const ADMIN_MASTER_WALLET = process.env.ADMIN_MASTER_WALLET;
const { providers } = require('./blockchain');

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
 * Executes a payment from the user's bot wallet to the admin wallet.
 * @param {string} userId - UUID of the user.
 * @param {string} type - 'NATIVE' or 'TOKEN'
 * @param {string} amount - Human-readable amount (e.g., "10.0")
 * @param {string} tokenAddress - Optional ERC-20 address
 * @param {string} networkOverride - Optional network ('POLYGON', 'BSC')
 * @param {string} referralAddress - Optional referral destination wallet
 * @param {string} referralAmount - Optional referral amount
 */
async function processCheckout(userId, type, amount, tokenAddress = null, networkOverride = null, referralAddress = null, referralAmount = null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true }
  });

  if (!user || !user.wallet) throw new Error('User wallet not found.');
  if (!ADMIN_MASTER_WALLET) throw new Error('ADMIN_MASTER_WALLET is not configured.');

  // 1. Setup Network and Provider
  const network = (networkOverride || user.wallet.network).toLowerCase();
  const provider = providers[network];
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

    // 3. Execute Transfer
    if (type === 'NATIVE') {
      const amountWei = parseUnits(amount.toString(), 18);
      
      if (referralAddress && referralAmount) {
        const refAmountWei = parseUnits(referralAmount.toString(), 18);
        const adminAmountWei = amountWei - refAmountWei;

        // Pay referrer first
        console.log(`[PaymentService] Instant payout to referrer: ${referralAmount} NATIVE`);
        const txRef = await signer.sendTransaction({ to: referralAddress, value: refAmountWei });
        await txRef.wait(1);

        // Pay admin rest
        tx = await signer.sendTransaction({ to: ADMIN_MASTER_WALLET, value: adminAmountWei });
      } else {
        const txParams = {
          to: ADMIN_MASTER_WALLET,
          value: amountWei
        };
        tx = await signer.sendTransaction(txParams);
      }
    } else if (type === 'TOKEN') {
      const tokenContract = new Contract(tokenAddress, ERC20_ABI, signer);
      const decimals = await getTokenDecimals(tokenAddress, signer);
      const amountWei = parseUnits(amount.toString(), decimals);
      
      if (referralAddress && referralAmount) {
        const refAmountWei = parseUnits(referralAmount.toString(), decimals);
        const adminAmountWei = amountWei - refAmountWei;

        // Pay referrer first
        console.log(`[PaymentService] Instant payout to referrer: ${referralAmount} TOKEN`);
        const txRef = await tokenContract.transfer(referralAddress, refAmountWei);
        await txRef.wait(1); // Wait for confirmation to avoid nonce issues

        // Pay admin rest
        tx = await tokenContract.transfer(ADMIN_MASTER_WALLET, adminAmountWei);
      } else {
        tx = await tokenContract.transfer(ADMIN_MASTER_WALLET, amountWei);
      }
    }

    const receipt = await tx.wait(1);
    return receipt.hash;
  } catch (error) {
    console.error(`[PaymentService] Transaction failed on ${network}:`, error.message);
    throw error;
  }
}

module.exports = {
  processCheckout
};
