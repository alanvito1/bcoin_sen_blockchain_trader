const { Wallet, isHexString } = require('ethers');
const prisma = require('../config/prisma');
const encryption = require('../utils/encryption');

/**
 * Generates a new random wallet for a user and stores it securely.
 * @param {string} userId - The internal UUID of the user.
 * @param {string} network - The target network (POLYGON or BSC).
 * @returns {Promise<string>} - The public address of the new wallet.
 */
async function generateNewWallet(userId, network = "POLYGON") {
  const wallet = Wallet.createRandom();
  const privateKey = wallet.privateKey;
  const publicAddress = wallet.address;

  const encrypted = encryption.encrypt(privateKey);

  // We still store a 'network' as the currently active trading network,
  // but the wallet itself is inherently multi-network.
  await prisma.wallet.upsert({
    where: { userId },
    update: {
      publicAddress,
      encryptedPrivateKey: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      network
    },
    create: {
      userId,
      publicAddress,
      encryptedPrivateKey: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      network
    }
  });

  return publicAddress;
}

/**
 * Imports an existing wallet for a user.
 * @param {string} userId - The internal UUID of the user.
 * @param {string} privateKey - The raw private key (to be cleared from memory).
 * @param {string} network - The active network.
 * @returns {Promise<string>} - The public address of the imported wallet.
 */
async function importExistingWallet(userId, privateKey, network = "POLYGON") {
  try {
    if (!isHexString(privateKey, 32)) {
      throw new Error('Invalid private key format. Must be a 32-byte hex string.');
    }

    const wallet = new Wallet(privateKey);
    const publicAddress = wallet.address;

    const encrypted = encryption.encrypt(privateKey);

    await prisma.wallet.upsert({
      where: { userId },
      update: {
        publicAddress,
        encryptedPrivateKey: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        network
      },
      create: {
        userId,
        publicAddress,
        encryptedPrivateKey: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        network
      }
    });

    // Mandatory: Clear privateKey from memory
    privateKey = null;

    return publicAddress;
  } catch (error) {
    // Ensure cleanup even on error
    privateKey = null;
    throw error;
  }
}

async function getOrCreateTransitWallet() {
  const secret = await prisma.systemSecret.findUnique({
    where: { key: 'TRANSIT_WALLET' }
  });

  if (secret) {
    const pk = encryption.decrypt({
      encryptedData: secret.encryptedValue,
      iv: secret.iv,
      authTag: secret.authTag
    });
    const wallet = new Wallet(pk);
    return { address: wallet.address, privateKey: pk };
  }

  // Create new autonomous wallet
  const wallet = Wallet.createRandom();
  const encrypted = encryption.encrypt(wallet.privateKey);

  await prisma.systemSecret.create({
    data: {
      key: 'TRANSIT_WALLET',
      encryptedValue: encrypted.encryptedData,
      iv: encrypted.iv,
      authTag: encrypted.authTag
    }
  });

  return { address: wallet.address, privateKey: wallet.privateKey };
}

async function revealTransitWallet() {
  const secret = await prisma.systemSecret.findUnique({
    where: { key: 'TRANSIT_WALLET' }
  });

  if (!secret) return null;

  return encryption.decrypt({
    encryptedData: secret.encryptedValue,
    iv: secret.iv,
    authTag: secret.authTag
  });
}

module.exports = {
  generateNewWallet,
  importExistingWallet,
  getOrCreateTransitWallet,
  revealTransitWallet
};
