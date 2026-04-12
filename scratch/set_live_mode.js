const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const res = await prisma.tradeConfig.updateMany({
      data: { dryRun: false }
    });
    console.log(`✅ SUCESSO: ${res.count} motores de trade foram alterados para modo REAL (Live).`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
