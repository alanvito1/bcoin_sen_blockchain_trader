require('dotenv').config();
const { ethers } = require('ethers');
const config = require('../src/config');

/**
 * DIRECT PRODUCTION FIRE TEST (Final Proof)
 * Performs a minimal swap on BSC and Polygon using direct ethers calls
 * to bypass any potential issues in the complex internal services.
 */

const ROUTER_ABI = [
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

async function directShot() {
  console.log("🔥 INICIANDO PROVA DE FOGO DIRETA (FINAL PROOF)\n");

  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("❌ PRIVATE_KEY não encontrada no .env");
    process.exit(1);
  }

  const targets = [
    {
      name: 'BSC (BCOIN)',
      rpc: 'https://bsc-dataseed.binance.org/',
      router: config.networks.bsc.router,
      wrappedNative: config.networks.bsc.wrappedNative,
      token: '0x00e1656e45f18ec6747f5a8496fd39b50b38396d',
      amountIn: ethers.parseEther('0.0001') // Minimal BNB
    },
    {
      name: 'POLYGON (SEN)',
      rpc: 'https://rpc.ankr.com/polygon',
      router: config.networks.polygon.router,
      wrappedNative: config.networks.polygon.wrappedNative,
      token: '0xfe302b8666539d5046cd9aa0707bb327f5f94c22',
      amountIn: ethers.parseEther('0.1') // Minimal POL
    }
  ];

  for (const target of targets) {
    console.log(`--- [${target.name}] Processando... ---`);
    try {
      const provider = new ethers.JsonRpcProvider(target.rpc);
      const wallet = new ethers.Wallet(pk, provider);
      const router = new ethers.Contract(target.router, ROUTER_ABI, wallet);

      const path = [target.wrappedNative, target.token];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

      console.log(`💸 Enviando compra real de ${target.name}...`);
      
      const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
        0, // Slippage 100% for this test shot
        path,
        wallet.address,
        deadline,
        { value: target.amountIn, gasLimit: 300000 }
      );

      console.log(`✅ Sucesso! Tx: https://${target.name.includes('BSC') ? 'bscscan.com' : 'polygonscan.com'}/tx/${tx.hash}`);
      await tx.wait();
      console.log(`🎊 Transação Confirmada!`);

    } catch (e) {
      console.error(`💥 Erro no ${target.name}: ${e.message}`);
    }
    console.log("\n");
  }

  process.exit(0);
}

directShot();
