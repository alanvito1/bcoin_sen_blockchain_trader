const { Wallet } = require('ethers');
const prisma = require('../src/config/prisma');
const encryption = require('../src/utils/encryption');
require('dotenv').config({ path: '.env.local' });

async function runWalletAudit() {
  console.log('🔍 [Wallet Audit] Starting comprehensive security check...');
  console.log('---------------------------------------------------------');

  try {
    // 1. Generation Test
    console.log('⚡ [1/4] Generating mock wallet...');
    const originalWallet = Wallet.createRandom();
    const originalPK = originalWallet.privateKey;
    const originalAddress = originalWallet.address;
    console.log(`   - Address: ${originalAddress}`);

    // 2. Encryption Test
    console.log('🔐 [2/4] Encrypting Private Key...');
    const encrypted = encryption.encrypt(originalPK);
    console.log(`   - Encrypted Data Length: ${encrypted.encryptedData.length}`);
    console.log(`   - IV: ${encrypted.iv}`);
    
    console.log('🔑 [3/4] Decrypting and checking bit-by-bit...');
    const decryptedPK = encryption.decrypt(encrypted);
    
    if (decryptedPK !== originalPK) {
        throw new Error('❌ FAILURE: Decrypted Private Key does not match the original!');
    }
    console.log('   ✅ Key matches original!');

    // 3. Database Persistence Test
    console.log('💾 [4/4] Testing Prisma persistence (Temporary Mock User)...');
    const mockTelegramId = BigInt(-1);
    
    // Cleanup any old test user/wallet
    const oldUser = await prisma.user.findUnique({ where: { telegramId: mockTelegramId } });
    if (oldUser) {
      await prisma.wallet.deleteMany({ where: { userId: oldUser.id } });
      await prisma.user.delete({ where: { id: oldUser.id } });
    }

    
    const testUser = await prisma.user.create({
      data: {
        telegramId: mockTelegramId,
        username: 'wallet_audit_bot'
      }
    });

    const testWallet = await prisma.wallet.create({
      data: {
        userId: testUser.id,
        publicAddress: originalAddress,
        encryptedPrivateKey: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        network: 'POLYGON'
      }
    });

    console.log(`   - DB Record created: ${testWallet.id}`);

    // 4. Verification from DB
    const retrievedWallet = await prisma.wallet.findUnique({
      where: { userId: testUser.id }
    });

    const finalPK = encryption.decrypt({
      encryptedData: retrievedWallet.encryptedPrivateKey,
      iv: retrievedWallet.iv,
      authTag: retrievedWallet.authTag
    });

    const finalAddress = new Wallet(finalPK).address;
    
    if (finalAddress !== originalAddress) {
        throw new Error('❌ FAILURE: Derived address from DB key does not match original address!');
    }
    console.log(`   ✅ DB-retrieved Address matches original: ${finalAddress}`);

    // 5. Cleanup
    await prisma.wallet.delete({ where: { id: testWallet.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
    console.log('🧹 [Cleanup] Mock data removed from DB.');


    console.log('---------------------------------------------------------');
    console.log('🎉 [SUCCESS] Wallet management audit passed 100%!');
    
  } catch (error) {
    console.error('---------------------------------------------------------');
    console.error('🛑 [AUDIT FAILED]', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runWalletAudit();
