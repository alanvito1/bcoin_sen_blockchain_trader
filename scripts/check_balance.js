const { ethers } = require('ethers');
require('dotenv').config();

async function checkBalance() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error("No PRIVATE_KEY in .env");
    return;
  }

  const polygonRpc = "https://polygon-bor-rpc.publicnode.com";
  const bscRpc = "https://bsc-dataseed.binance.org/";

  const providerP = new ethers.JsonRpcProvider(polygonRpc);
  const providerB = new ethers.JsonRpcProvider(bscRpc);

  const walletP = new ethers.Wallet(pk, providerP);
  const walletB = new ethers.Wallet(pk, providerB);

  console.log(`Wallet Address: ${walletP.address}`);

  try {
      const balP = await providerP.getBalance(walletP.address);
      const balB = await providerB.getBalance(walletB.address);

      console.log(`Polygon (POL) Balance: ${ethers.formatEther(balP)}`);
      console.log(`BSC (BNB) Balance: ${ethers.formatEther(balB)}`);
  } catch (e) {
      console.error("Error checking balance:", e.message);
  }
}

checkBalance().catch(console.error);
