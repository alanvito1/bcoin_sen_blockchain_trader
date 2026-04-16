const { ethers, formatUnits, Contract } = require('ethers');
const prisma = require('../src/config/prisma');
const config = require('../src/config');
const { encryption } = require('../src/utils/encryption');

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function main() {
  console.log('🔍 AUDITORIA DE SALDO MAINNET (BSC)...');
  
  // 1. Get Wallet
  const wallet = await prisma.wallet.findFirst();
  if (!wallet) throw new Error('Cofre não encontrado no banco.');

  console.log(`📡 Cofre: ${wallet.publicAddress}`);

  // 2. Setup Provider
  const rpcUrl = config.networks.bsc.rpc.split(',')[0].trim();
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // 3. Check BNB
  const bnbWei = await provider.getBalance(wallet.publicAddress);
  const bnb = formatUnits(bnbWei, 18);
  console.log(`⛽ BNB (Gas): ${bnb}`);

  // 4. Check USDT
  const usdtAddress = config.networks.bsc.usdt;
  const usdtContract = new Contract(usdtAddress, ERC20_ABI, provider);
  const [usdtWei, decimals, symbol] = await Promise.all([
    usdtContract.balanceOf(wallet.publicAddress).catch(() => 0n),
    usdtContract.decimals().catch(() => 18),
    usdtContract.symbol().catch(() => 'USDT')
  ]);
  
  const usdtFormatted = formatUnits(usdtWei, decimals);
  console.log(`💵 ${symbol}: ${usdtFormatted}`);

  if (parseFloat(bnb) < 0.001) {
    console.warn('⚠️ ALERTA: Saldo de BNB baixo para taxas!');
  }

  if (parseFloat(usdtFormatted) < 1.0) {
    console.warn('⚠️ ALERTA: Saldo de USDT insuficiente para a micro-transação (mínimo $1).');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ FATAL:', err);
  process.exit(1);
});
