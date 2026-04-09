const prisma = require('../src/config/prisma');
const config = require('../src/config');
const { encryption } = require('../src/utils/encryption');
const { swapToken } = require('../src/services/swapper');
const { ethers } = require('ethers');

async function main() {
  console.log('🚀 MISSÃO: FOGO REAL (MAINNET BSC)');
  console.log('🎯 Alvo: 1 USDT ➔ BCOIN');

  const userId = '1'; // Target user (Founder)
  const user = await prisma.user.findFirst({
    where: { id: userId },
    include: { wallet: true, tradeConfigs: true }
  });

  if (!user || !user.wallet) throw new Error('Usuário ou Carteira não encontrada.');

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
