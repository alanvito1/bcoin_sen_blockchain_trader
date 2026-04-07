require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// BigInt JSON global patch (Prisma needs this)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

async function check() {
  const users = await prisma.user.findMany({
    include: { tradeConfigs: true, wallet: true }
  });
  console.log(JSON.stringify(users, null, 2));
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
