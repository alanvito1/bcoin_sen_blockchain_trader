const { parseUnits } = require('ethers');
const proxyquire = require('proxyquire').noCallThru();

// 1. Mock Ethers
const mockSigner = {
  sendTransaction: async (tx) => {
    console.log(`[MOCK ETHERS] sendTransaction chamado! Destino: ${tx.to}, Valor: ${tx.value.toString()} Wei`);
    return { hash: '0xabc123', wait: async () => ({ status: 1 }) };
  }
};

const mockContract = {
  transfer: async (to, amount) => {
    console.log(`[MOCK ETHERS] Contract.transfer chamado! Destino: ${to}, Valor: ${amount.toString()} Wei`);
    return { hash: '0xdef456', wait: async () => ({ status: 1 }) };
  },
  decimals: async () => 18
};

const mockEthers = {
  Wallet: function() { return mockSigner; },
  Contract: function() { return mockContract; },
  parseUnits: parseUnits,
  JsonRpcProvider: function() { return {}; } // mock provider
};

// 2. Mock Prisma
const mockPrisma = {
  user: {
    findUnique: async () => ({
      id: 'usr_123',
      wallet: {
        network: 'BSC',
        encryptedPrivateKey: 'mock',
        iv: 'mock',
        authTag: 'mock'
      }
    })
  }
};

// 3. Mock Encryption
const mockEncryption = {
  decrypt: () => '0x0000000000000000000000000000000000000000000000000000000000000001'
};

// 4. Mock Blockchain Providers
const mockBlockchain = {
  providers: { bsc: {}, polygon: {} }
};

// Load the service with mocked dependencies
const paymentService = proxyquire('../src/services/paymentService', {
  'ethers': mockEthers,
  '../config/prisma': mockPrisma,
  '../utils/encryption': mockEncryption,
  './blockchain': mockBlockchain
});

// TEST EXECUTION
async function runTests() {
  console.log("=== INICIANDO TESTE MOCKADO DE CHECKOUT (SPLIT INSTANTÂNEO) ===\n");

  process.env.ADMIN_MASTER_WALLET = '0xAdminMasterWalletAddress';

  console.log("=== TESTE 1: Transferência TOKEN (Sem Indicador) ===");
  await paymentService.processCheckout('usr_123', 'TOKEN', '10.0', '0xTokenAddress', 'BSC', null, null);
  console.log("------------------------------------------------------\n");

  console.log("=== TESTE 2: Transferência TOKEN (COM Indicador a 10%) ===");
  await paymentService.processCheckout('usr_123', 'TOKEN', '10.0', '0xTokenAddress', 'BSC', '0xReferralWalletAddress', '1.0');
  console.log("------------------------------------------------------\n");
  
  console.log("✅ Validação concluída!");
}

runTests().catch(console.error);
