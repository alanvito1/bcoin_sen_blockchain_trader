const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://postgres:postgres@localhost:5433/autotrader?schema=public' }
  }
});

async function main() {
  console.log('🔗 Tentando conectar ao BD no host (Porta 5433)...');
  try {
    const userCount = await prisma.user.count();
    console.log(`✅ Conectado! Total de usuários: ${userCount}`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Falha na conexão:', e.message);
    process.exit(1);
  }
}
main();
