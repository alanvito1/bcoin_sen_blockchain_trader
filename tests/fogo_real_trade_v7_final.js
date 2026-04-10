const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { ethers } = require('ethers');
const config = require('../src/config');
const swapper = require('../src/services/swapper');

function decrypt(encData, iv, authTag) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(encData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  console.log('🚀 MISSÃO: FOGO REAL v7.6 (SELL MODE)');
  console.log('🎯 Alvo: 1 BCOIN \u2794 BNB (venda de unidade)');
  
  const tid = 1692505402n; // Seu ID
  
  const user = await prisma.user.findFirst({
    where: { telegramId: tid },
    include: { wallet: true }
  });

  if (!user || !user.wallet) {
    console.error('❌ Carteira não encontrada no banco!');
    return;
  }

  console.log('✅ Carteira Identificada: ' + user.wallet.publicAddress);

  const encData = user.wallet.encryptedPrivateKey;
  const iv = user.wallet.iv;
  const authTag = user.wallet.authTag;

  let privateKey;
  try {
    privateKey = decrypt(encData, iv, authTag);
    console.log('✅ Chave Privada Descriptografada.');
  } catch (err) {
    console.error('❌ Falha na descriptografia: ' + err.message);
    return;
  }

  const bscRpc = 'https://bsc-dataseed1.binance.org/';
  const provider = new ethers.JsonRpcProvider(bscRpc);
  const signer = new ethers.Wallet(privateKey, provider);
  console.log('✅ Signer Pronto: ' + signer.address);

  const bcoin = config.networks.bsc.tokens.find(t => t.symbol === 'BCOIN');

  console.log('🔄 Executando SWAP (VENDER 1 BCOIN)...');
  
  try {
    const result = await swapper.swapToken(
      'bsc',
      bcoin,
      'sell',
      '1.0',
      'token',
      null,
      signer
    );

    if (result && result.status === 1) {
      console.log('\n🔥 VITÓRIA É NOSSA!');
      console.log('✅ Hash: ' + result.hash);
      console.log('🔗 Explorer: https://bscscan.com/tx/' + result.hash);
    } else {
      console.error('\n❌ VENDA FALHOU!');
      console.error('Causa: ' + (result?.error || 'Erro interno'));
    }
  } catch (err) {
    console.error('\n❌ ERRO CRÍTICO: ' + err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
