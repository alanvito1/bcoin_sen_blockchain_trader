require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check() {
  const users = await prisma.user.findMany({
    include: { tradeConfig: true, wallet: true }
  });
  console.log(JSON.stringify(users, null, 2));
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
