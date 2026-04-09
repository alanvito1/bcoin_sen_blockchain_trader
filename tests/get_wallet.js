const prisma = require('../src/config/prisma');

async function main() {
  const wallets = await prisma.wallet.findMany();
  console.log(JSON.stringify(wallets, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
