const { ethers } = require('ethers');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const providers = {
  bsc: new ethers.JsonRpcProvider('https://rpc.ankr.com/bsc'),
  polygon: new ethers.JsonRpcProvider('https://rpc.ankr.com/polygon')
};

const TOKENS = {
  bsc: {
    BCOIN: '0x00e1656e45f18ad619527a228208a360ba393774',
    SEN: '0x1779cdcaade16d7a46c65099f666b6c0e071e6fd',
    USDT: '0x55d398326f99059ff775485246999027b3197955'
  },
  polygon: {
    BCOIN: '0x00e1656e45f18ad619527a228208a360ba393774',
    SEN: '0x1779cdcaade16d7a46c65099f666b6c0e071e6fd',
    USDT: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f'
  }
};

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)', 'function decimals() view returns (uint8)'];

async function run() {
  try {
    const userId = '243b72cd-69fc-465f-8196-09ad9391cb6c';
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return console.log('Wallet not found');
    
    console.log(`Auditing Wallet: ${wallet.publicAddress}`);
    
    for (const [net, provider] of Object.entries(providers)) {
      console.log(`\n--- ${net.toUpperCase()} ---`);
      const nativeBal = await provider.getBalance(wallet.publicAddress);
      console.log(`Native: ${ethers.formatEther(nativeBal)}`);
      
      for (const [symbol, address] of Object.entries(TOKENS[net])) {
        try {
          const contract = new ethers.Contract(address, ERC20_ABI, provider);
          const bal = await contract.balanceOf(wallet.publicAddress);
          const dec = await contract.decimals();
          console.log(`${symbol}: ${ethers.formatUnits(bal, dec)}`);
        } catch (e) {
          console.log(`${symbol}: Error ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
