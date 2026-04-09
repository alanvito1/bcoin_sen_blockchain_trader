const { Queue, Worker } = require('bullmq');
const redisConnection = require('../src/config/redis');
const prisma = require('../src/config/prisma');
const logger = require('../src/utils/logger');
const dotenv = require('dotenv');

dotenv.config();

/**
 * PHASE 3: Stress Test Engine
 * This script triggers 500 dry-run trades to measure throughput and stability.
 */
async function runStressTest(jobCount = 500) {
    console.log(`\n🚀 [STRESS TEST] Iniciando carga de ${jobCount} jobs...`);
    
    // 1. Initial State
    const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });
    
    console.log('🧹 Limpando fila atual...');
    await tradeQueue.drain();
    await tradeQueue.obliterate({ force: true }).catch(() => {});
    
    // Setup target user (BCOIN pair)
    const config = await prisma.tradeConfig.findFirst({
        where: { tokenPair: 'BCOIN/USDT', network: 'BSC' }
    });

    if (!config) {
        console.error('❌ Configuração BCOIN/USDT não encontrada para o teste.');
        process.exit(1);
    }

    // Ensure Dry Run is ON globally or for this user
    await prisma.tradeConfig.update({
        where: { id: config.id },
        data: { dryRun: true, isOperating: true }
    });

    const wallet = await prisma.wallet.findUnique({ where: { userId: config.userId } });

    // 2. Load Generation
    console.log(`📦 Injetando ${jobCount} jobs na tradeQueue...`);
    const startTime = Date.now();
    
    const promises = [];
    for (let i = 0; i < jobCount; i++) {
        promises.push(tradeQueue.add('executeTrade', {
            userId: config.userId,
            tradeConfigId: config.id,
            walletId: wallet.id,
            isStressTest: true // Metadata for tracing
        }));
    }
    
    await Promise.all(promises);
    const injectionTime = (Date.now() - startTime) / 1000;
    console.log(`✅ Injeção concluída em ${injectionTime.toFixed(2)}s.`);

    // 3. Telemetry Loop
    console.log('⏳ Monitorando esvaziamento da fila...');
    
    let processed = 0;
    const monitorInterval = setInterval(async () => {
        const counts = await tradeQueue.getJobCounts('completed', 'failed', 'active', 'wait');
        processed = counts.completed + counts.failed;
        const progress = (processed / jobCount) * 100;
        
        process.stdout.write(`\r📊 Progresso: ${progress.toFixed(1)}% (${processed}/${jobCount}) | Ativos: ${counts.active} | Espera: ${counts.wait}   `);
        
        if (processed >= jobCount) {
            clearInterval(monitorInterval);
            const totalTime = (Date.now() - startTime) / 1000;
            const throughput = jobCount / totalTime;
            
            console.log('\n\n🏁 [STRESS TEST CONCLUÍDO]');
            console.log('------------------------------------------');
            console.log(`Tempo Total:    ${totalTime.toFixed(2)}s`);
            console.log(`Throughput:     ${throughput.toFixed(2)} trades/seg`);
            console.log(`Sucesso:        ${counts.completed}`);
            console.log(`Falhas:         ${counts.failed}`);
            console.log('------------------------------------------\n');
            
            await prisma.$disconnect();
            await tradeQueue.close();
            process.exit(0);
        }
    }, 1000);
}

runStressTest(500).catch(err => {
    console.error('💥 Erro fatal no Stress Test:', err);
    process.exit(1);
});
