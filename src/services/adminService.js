const { ethers } = require('ethers');
const prisma = require('../config/prisma');
const config = require('../config');
const { providers } = require('./blockchain');
const explorer = require('../utils/explorer');

/**
 * Service for administrative and maintenance tasks
 */
const AdminService = {
  /**
   * Clears stuck transactions on a specific network for the master wallet
   */
  async clearMasterStuckTransactions(networkName = 'polygon') {
    const network = networkName.toLowerCase();
    const provider = providers[network];
    const ADMIN_PK = process.env.ADMIN_PRIVATE_KEY;
    
    if (!ADMIN_PK) throw new Error('ADMIN_PRIVATE_KEY not configured.');
    if (!provider) throw new Error(`Provider for ${network} not found.`);

    const wallet = new ethers.Wallet(ADMIN_PK, provider);
    const nonceLatest = await wallet.getNonce('latest');
    const noncePending = await wallet.getNonce('pending');

    if (noncePending <= nonceLatest) {
      return { status: 'CLEAN', message: `Fila da ${networkName} está limpa.` };
    }

    const diff = noncePending - nonceLatest;
    
    // Get gas
    const gas = network === 'polygon' 
      ? await explorer.getPolygonGasPrice() 
      : await provider.getFeeData();

    let maxPriorityFee, maxFee;
    if (network === 'polygon') {
      maxPriorityFee = ethers.parseUnits((gas.maxPriorityFee * 2).toFixed(5), 'gwei');
      maxFee = ethers.parseUnits((gas.maxFee * 2).toFixed(5), 'gwei');
    } else {
      maxPriorityFee = (gas.maxPriorityFeePerGas * 150n) / 100n;
      maxFee = (gas.maxFeePerGas * 150n) / 100n;
    }

    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      nonce: nonceLatest,
      maxPriorityFeePerGas: maxPriorityFee,
      maxFeePerGas: maxFee,
      gasLimit: 21000
    });

    return { 
      status: 'SENT', 
      txHash: tx.hash, 
      diff, 
      link: explorer.getExplorerLink(network, tx.hash) 
    };
  },

  /**
   * Basic database health check
   */
  async getDatabaseHealth() {
    const [userCount, walletCount, tradeCount, lastTrades] = await Promise.all([
      prisma.user.count(),
      prisma.wallet.count(),
      prisma.tradeHistory.count(),
      prisma.tradeHistory.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { status: true, type: true, createdAt: true }
      })
    ]);

    return {
      users: userCount,
      wallets: walletCount,
      trades: tradeCount,
      lastTrades
    };
  }
};

module.exports = AdminService;
