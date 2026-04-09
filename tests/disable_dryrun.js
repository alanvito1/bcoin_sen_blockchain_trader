const prisma = require('../src/config/prisma');

async function main() {
  console.log('🚀 Desativando TRAVAS DE SEGURANÇA (Dry Run)...');
  
  const result = await prisma.tradeConfig.updateMany({
    data: { dryRun: false }
  });

  console.log(`✅ Sucesso! ${result.count} configurações de trade agora operam em MAINNET.`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
