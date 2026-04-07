const balanceService = require('./src/services/balanceService');
const config = require('./src/config');

async function verify() {
  const address = '0x1674CD8445d4B0E2a4f69BB01Ba55318727BeE80';
  console.log(`🔍 Verificando Saúde On-Chain para a Carteira: ${address}\n`);

  try {
    // Check Polygon
    console.log("🟠 Rede: POLYGON");
    const polyBalance = await balanceService.checkBalances(address, 'POLYGON');
    console.log(`   - MATIC: ${polyBalance.nativeBalance}`);
    console.log(`   - USDT:  ${polyBalance.tokenBalance} (ou token padrão)`);

    // Check BSC
    console.log("\n🟡 Rede: BSC");
    const bscBalance = await balanceService.checkBalances(address, 'BSC');
    console.log(`   - BNB:   ${bscBalance.nativeBalance}`);
    console.log(`   - Token: ${bscBalance.tokenBalance} (ou token padrão)`);

    console.log("\n✅ Conectividade com Nodes (RPC) e Balance Service: OK");
  } catch (err) {
    console.error(`\n❌ Falha na verificação: ${err.message}`);
    process.exit(1);
  }
}

verify();
