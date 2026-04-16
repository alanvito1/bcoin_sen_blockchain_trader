const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const encryption = require('../src/utils/encryption');
require('dotenv').config();

/**
 * SEED PRODUCTION USER
 * Creates a live test user in the DB with the provided private key and active strategies.
 */

async function seedUser() {
  console.log("🌱 INICIALIZANDO BANCO DE DADOS PARA PROVA TÉCNICA...\n");

  const pk = process.env.PRIVATE_KEY;
  const adminWallet = process.env.ADMIN_MASTER_WALLET;

  if (!pk || !adminWallet) {
    console.error("🛑 Erro: PRIVATE_KEY ou ADMIN_MASTER_WALLET ausentes no .env");
    return;
  }

  try {
    // 1. Create/Update User
    const user = await prisma.user.upsert({
      where: { telegramId: 99999999 }, // Test ID
      update: { isActive: true, credits: 100 },
      create: {
        telegramId: 99999999,
        username: "ProdTestUser",
        credits: 100,
        isActive: true
      }
    });

    console.log(`✅ Usuário ${user.username} criado/atualizado.`);

    // 2. Encrypt and Save Wallet
    const encrypted = encryption.encrypt(pk);
    const walletAddress = "0x0000000000000000000000000000000000000000"; // Substitua pelo endereço da sua carteira de teste

    await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {
        publicAddress: walletAddress,
        encryptedPrivateKey: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag
      },
      create: {
        userId: user.id,
        publicAddress: walletAddress,
        encryptedPrivateKey: encrypted.encryptedData,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        network: "POLYGON"
      }
    });

    console.log(`✅ Carteira 0x16... vinculada e criptografada no DB.`);

    // 3. Setup Active Trade Configs (BCOIN and SEN)
    const pairs = [
      { pair: "BCOIN/USDT", network: "BSC" },
      { pair: "SEN/USDT", network: "POLYGON" }
    ];

    for (const p of pairs) {
      await prisma.tradeConfig.upsert({
        where: { userId_network_tokenPair: { userId: user.id, network: p.network, tokenPair: p.pair } },
        update: { isOperating: true },
        create: {
          userId: user.id,
          network: p.network,
          tokenPair: p.pair,
          buyAmountA: 0.1, // Set small test amounts
          sellAmountA: 0.1,
          isOperating: true,
          rsiEnabled: true, // Let's test the new indicator too
          rsiPeriod: 14
        }
      });
      console.log(`✅ Configuração de sinal ativa para: ${p.pair} na ${p.network}`);
    }

    console.log("\n🏁 BANCO DE DADOS PRONTO PARA O DISPARO REAL.");

  } catch (error) {
    console.error("💥 Erro ao semear usuário:", error.message);
  } finally {
    process.exit(0);
  }
}

seedUser();
