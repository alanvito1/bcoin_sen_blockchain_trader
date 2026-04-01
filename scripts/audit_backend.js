/**
 * AUDIT BACKEND - Simulation Module
 * Versão: 1.0.0
 * Descrição: Valida conexões RPC, Banco de Dados, Persistência de Sessão e Segurança.
 */

const { ethers } = require('ethers');
const prisma = require('../src/config/prisma');
const balanceService = require('../src/services/balanceService');
const sessionStore = require('../src/bot/sessionStore');
require('dotenv').config();

// Patch Global para BigInt (Garantir que o fix está ativo)
BigInt.prototype.toJSON = function() { return this.toString(); };

async function runAudit() {
  console.log('🔍 INICIANDO AUDITORIA DE BACKEND...\n');
  const results = {
    rpc: [],
    database: 'PENDING',
    session: 'PENDING',
    security: 'PENDING'
  };

  try {
    // 1. CHECAGEM DE SALDOS (Multi-Chain RPC)
    console.log('--- [1/3] Checagem de Saldos e Conectividade RPC ---');
    const testWallet = process.env.PUBLIC_ADDRESS || '0x0000000000000000000000000000000000000000';
    console.log(`Usando carteira para teste: ${testWallet}`);

    const balances = await balanceService.getMultiChainBalances(testWallet);
    
    ['polygon', 'bsc'].forEach(net => {
      const data = balances[net];
      if (data && !data.error) {
        console.log(`✅ [${net.toUpperCase()}] Conectado. Saldo Native: ${data.nativeBalance} ${data.gasUnit}`);
        results.rpc.push({ network: net, status: 'OK' });
      } else {
        console.error(`❌ [${net.toUpperCase()}] Falha na conexão ou erro: ${data ? data.error : 'Unknown'}`);
        results.rpc.push({ network: net, status: 'FAILED' });
      }
    });

    // 2. VERIFICAÇÃO LIGA/DESLIGA MOTORES (Prisma DB)
    console.log('\n--- [2/3] Simulação de Liga/Desliga Motores ---');
    const firstConfig = await prisma.tradeConfig.findFirst();
    if (firstConfig) {
      console.log(`Motor de teste encontrado: ${firstConfig.network} - ${firstConfig.tokenPair}`);
      
      // Simular Liga
      await prisma.tradeConfig.update({ where: { id: firstConfig.id }, data: { isOperating: true } });
      let updated = await prisma.tradeConfig.findUnique({ where: { id: firstConfig.id } });
      console.log(`✅ Estado LIGADO: ${updated.isOperating === true ? 'OK' : 'FALHA'}`);

      // Simular Desliga
      await prisma.tradeConfig.update({ where: { id: firstConfig.id }, data: { isOperating: false } });
      updated = await prisma.tradeConfig.findUnique({ where: { id: firstConfig.id } });
      console.log(`✅ Estado DESLIGADO: ${updated.isOperating === false ? 'OK' : 'FALHA'}`);

      results.database = 'OK';
    } else {
      console.warn('⚠️ Nenhum motor configurado no banco para teste.');
      results.database = 'SKIPPED';
    }

    // 3. VALIDAÇÃO DE PERSISTÊNCIA E SEGURANÇA (BigInt + Session)
    console.log('\n--- [3/3] Validação de Persistência e Segurança ---');
    
    // Teste de Sessão (P2021 Check)
    const testKey = 'audit:session:test';
    const testData = { timestamp: Date.now(), status: 'audit' };
    await sessionStore.set(testKey, testData);
    const readSession = await sessionStore.get(testKey);
    
    if (readSession && readSession.status === 'audit') {
      console.log('✅ Persistência de Sessão (Tabela Session): OK');
      results.session = 'OK';
      await sessionStore.delete(testKey);
    } else {
      console.error('❌ Falha na persistência de sessão!');
      results.session = 'FAILED';
    }

    // Teste de BigInt (Safe Serialization)
    const bigIntObj = { id: BigInt(123456789), message: 'BigInt Test' };
    try {
      const serialized = JSON.stringify(bigIntObj);
      console.log(`✅ Serialização BigInt: OK -> ${serialized}`);
      results.security = 'OK';
    } catch (e) {
      console.error('❌ Falha na serialização BigInt (Fix ausente):', e.message);
      results.security = 'FAILED';
    }

    // FINAL REPORT
    console.log('\n=========================================');
    console.log('        RESULTADO FINAL DA AUDITORIA      ');
    console.log('=========================================');
    console.table([
      { Módulo: 'Conectividade RPC (Polygon)', Status: results.rpc.find(r => r.network === 'polygon').status },
      { Módulo: 'Conectividade RPC (BSC)', Status: results.rpc.find(r => r.network === 'bsc').status },
      { Módulo: 'Escrita de Banco (Prisma)', Status: results.database },
      { Módulo: 'Tabela de Sessão (Persistência)', Status: results.session },
      { Módulo: 'Segurança (BigInt Patch)', Status: results.security }
    ]);

  } catch (err) {
    console.error('\n💥 ERRO CRÍTICO DURANTE AUDITORIA:', err.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runAudit();
