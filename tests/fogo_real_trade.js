const prisma = require('../src/config/prisma');
const config = require('../src/config');
const { encryption } = require('../src/utils/encryption');
const { swapToken } = require('../src/services/swapper');
const { ethers } = require('ethers');

async function main() {
  console.log('🚀 MISSÃO: FOGO REAL (MAINNET BSC)');
  console.log('🎯 Alvo: 1 USDT ➔ BCOIN');

  const telegramId = 1692505402n; // Target user (Founder)
  console.log(`🔍 Buscando usuário com Telegram ID: ${telegramId.toString()}...`);
  
  const user = await prisma.user.findFirst({
    where: { 
      OR: [
        { telegramId: telegramId },
        { telegramId: Number(telegramId) } // Try both for robustness
      ]
    },
    include: { wallet: true }
  });

  if (!user) {
    console.error('❌ Usuário não encontrado no banco de dados.');
    const allUsers = await prisma.user.findMany({ select: { id: true, telegramId: true } });
    console.log('Usuários disponíveis:', allUsers.map(u => ({ id: u.id, tid: u.telegramId.toString() })));
    throw new Error('Missão abortada: Usuário não existe.');
  }

  if (!user.wallet) {
    console.error(`❌ Usuário ${user.id} encontrado, mas SEM CARTEIRA vinculada.`);
    throw new Error('Missão abortada: Carteira não configurada.');
  }

  console.log(`✅ Usuário e Carteira localizados: ${user.id}`);

  // 1. Decrypt Wallet
  const rpcUrl = config.networks.bsc.rpc.split(',')[0].trim();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const decryptedKey = encryption.decrypt(user.wallet.privateKey, user.wallet.iv);
  const signer = new ethers.Wallet(decryptedKey, provider);

  console.log(`📡 Operando com: ${signer.address}`);

  // 2. Token Configs
  const usdtConfig = {
    address: config.networks.bsc.usdt,
    symbol: 'USDT',
    decimals: 18
  };

  const bcoinConfig = config.networks.bsc.tokens.find(t => t.symbol === 'BCOIN');
  if (!bcoinConfig) throw new Error('Configuração de BCOIN não encontrada.');

  // 3. Force Real Execution Parameters
  const amountToSwap = '1.0';
  
  console.log('💸 Iniciando SWAP REAL na DEX...');
  
  const result = await swapToken(
    'bsc',
    bcoinConfig,
    'buy', 
    amountToSwap,
    'token', // Custom amount in token (USDT)
    null,    // No market price for this simple micro-transact
    signer,  // use the signer
    usdtConfig // inputTokenOverride
  );

  if (result && result.status === 1) {
    console.log('\n✅ TRANSMISSÃO DE SUCESSO!');
    console.log(`🔗 TxHash: ${result.hash}`);
    console.log(`🔗 Explorer: https://bscscan.com/tx/${result.hash}`);
  } else {
    console.error('\n❌ FALHA NA MISSÃO!');
    if (result && result.error) console.error(`Motivo: ${result.error}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ ERRO FATAL:', err);
  process.exit(1);
});
