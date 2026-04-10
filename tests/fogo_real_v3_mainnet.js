/**
 * @file tests/fogo_real_v3_mainnet.js
 * @description Injects a real trade job (SELL 1 BCOIN) into the official BullMQ pipeline.
 * This script bypasses strategy analysis using the 'forceSignal' override injected into tradeExecutor.js.
 */

const { Queue } = require('bullmq');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const IORedis = require('ioredis');

// Connect to Redis (Adjust URL if needed for VPS)
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6380');

async function main() {
    console.log('🚀 Iniciando Injeção de Fogo Real (V3 - Oficial Engine)...');

    const telegramId = 1692505402n; // User Founder
    
    // 1. Encontrar o usuário e suas configurações
    const user = await prisma.user.findUnique({
        where: { telegramId },
        include: { 
            tradeConfigs: true,
            wallet: true
        }
    });

    if (!user || user.tradeConfigs.length === 0) {
        console.error('❌ Usuário ou Configurações não encontradas.');
        process.exit(1);
    }

    // 2. Localizar Config de BCOIN (BSC) para Venda
    const bcoinConfig = user.tradeConfigs.find(c => c.tokenPair.includes('BCOIN') && c.network === 'BSC');

    if (!bcoinConfig) {
        console.error('❌ Configuração para BCOIN na BSC não encontrada.');
        process.exit(1);
    }

    console.log(`✅ Config encontrada: ${bcoinConfig.id} (${bcoinConfig.tokenPair})`);

    // 3. Preparar a Config para Trade Real
    console.log('🛠️ Atualizando configurações para 1.0 TOKENS e desativando Dry Run...');
    await prisma.tradeConfig.update({
        where: { id: bcoinConfig.id },
        data: {
            sellAmountA: 1.0,  // Definindo 1 TOKEN exato
            dryRun: false,    // Fogo REAL
            isOperating: true // Garantir que está ativo
        }
    });

    // 4. Injetar o Job no BullMQ
    const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });

    console.log('📨 Injetando Job na fila [tradeQueue] com forceSignal: SELL...');
    const job = await tradeQueue.add('trade-validation-real', {
        userId: user.id,
        tradeConfigId: bcoinConfig.id,
        walletId: user.wallet.id,
        forceSignal: 'SELL', // Override injetado no worker
        forceStrategy: 'A'   // Usar sellAmountA (1.0)
    });

    console.log(`✨ JOB INJETADO! ID: ${job.id}`);
    console.log('📋 Próximos passos:');
    console.log('1. Verifique os logs do Docker: docker logs -f trader-engine');
    console.log('2. Acompanhe a transação no BscScan.');
    
    await prisma.$disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('💥 Erro fatal:', err);
    process.exit(1);
});
