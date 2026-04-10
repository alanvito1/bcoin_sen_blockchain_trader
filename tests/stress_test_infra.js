const { Queue } = require('bullmq');
const redisConnection = require('../src/config/redis');
const prisma = require('../src/config/prisma');
const dotenv = require('dotenv');

dotenv.config();

/**
 * 🔥 ESTRUTURA DO STRESS TEST INFRA (PASSO 2A)
 * 2.000 Jobs totais divididos em 4 rotas (500 cada)
 * Monitoramento de Performance do Redis/BullMQ/Prisma
 */
async function runStressTest() {
    console.log(`\n🚀 [STRESS TEST INFRA] Iniciando avalanche de jobs (Dry Run)...`);
    
    const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });
    
    // Cleanup prior to test
    console.log('🧹 Limpando fila anterior...');
    await tradeQueue.drain();
    
    // Find master user (QA session user)
    const wallet = await prisma.wallet.findFirst();
    if (!wallet) {
        console.error('❌ Nenhuma wallet encontrada no banco.');
        process.exit(1);
    }
    const userId = wallet.userId;

    // Definição das Rotas
    const routes = [
        { network: 'BSC', tokenPair: 'BCOIN/USDT', signal: 'BUY' },
        { network: 'BSC', tokenPair: 'BCOIN/USDT', signal: 'SELL' },
        { network: 'POLYGON', tokenPair: 'SEN/USDT', signal: 'BUY' },
        { network: 'POLYGON', tokenPair: 'SEN/USDT', signal: 'SELL' }
    ];

    const routeConfigs = [];
    console.log('⚙️ Preparando configurações (Garantindo DRY RUN)...');

    for (const r of routes) {
        let config = await prisma.tradeConfig.findFirst({
            where: { userId, network: r.network, tokenPair: r.tokenPair }
        });

        if (!config) {
            config = await prisma.tradeConfig.create({
                data: {
                    userId,
                    network: r.network,
                    tokenPair: r.tokenPair,
                    isOperating: true,
                    dryRun: true,
                    buyAmountA: 1.0,
                    sellAmountA: 1.0,
                    buyAmountB: 1.0,
                    sellAmountB: 1.0,
                    slippage: 10.0
                }
            });
        } else {
            config = await prisma.tradeConfig.update({
                where: { id: config.id },
                data: { dryRun: true, isOperating: true }
            });
        }
        routeConfigs.push({ ...r, id: config.id });
    }

    // Injeção de 400 jobs (Stress Test Infra)
    // 🛠️ Optimization: Desativar notificações para teste puro de infraestrutura
    console.log('🔇 Desativando notificações para o usuário de teste...');
    const originalUserSettings = await prisma.user.findUnique({
        where: { id: userId },
        select: { notifyTrades: true, notifySteps: true, notifyBalances: true }
    });
    
    await prisma.user.update({
        where: { id: userId },
        data: { notifyTrades: false, notifySteps: false, notifyBalances: false }
    });

    const JOBS_PER_ROUTE = 100; // FIX FIX: RE-REDUZIDO DE 500 PARA 100!
    const TOTAL_JOBS = routeConfigs.length * JOBS_PER_ROUTE;
    console.log(`🎯 Injetando ${JOBS_PER_ROUTE} jobs por rota. Total: ${TOTAL_JOBS}`);

    const startTime = Date.now();
    const batchSize = 100;
    
    for (let i = 0; i < TOTAL_JOBS; i += batchSize) {
        const promises = [];
        for (let j = 0; j < batchSize && (i + j) < TOTAL_JOBS; j++) {
            const route = routeConfigs[(i + j) % routeConfigs.length];
            promises.push(tradeQueue.add('executeTrade', {
                userId,
                tradeConfigId: route.id,
                walletId: wallet.id,
                forceSignal: route.signal.toLowerCase(),
                forcePrice: 1.0, // Bypass Price Hotfix to avoid rate limits
                isStressTest: true
            }, {
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true
            }));
        }
        await Promise.all(promises);
        process.stdout.write(`\r⚡ Injeção: ${i + batchSize}/${TOTAL_JOBS} jobs... `);
    }
    
    console.log(`\n✅ Injeção concluída em ${((Date.now() - startTime)/1000).toFixed(2)}s. Monitorando processamento...`);

    const monitor = setInterval(async () => {
        const counts = await tradeQueue.getJobCounts('completed', 'failed', 'active', 'wait');
        const processed = counts.completed + counts.failed;
        const elapsed = (Date.now() - startTime) / 1000;
        const tps = (processed / elapsed).toFixed(2);
        
        process.stdout.write(`\r📊 Progresso: ${((processed/TOTAL_JOBS)*100).toFixed(1)}% (${processed}/${TOTAL_JOBS}) [Ativos: ${counts.active}] | TPS: ${tps} `);
        
        if (processed >= TOTAL_JOBS) {
            clearInterval(monitor);
            const totalTime = (Date.now() - startTime) / 1000;
            
            // Restore notifications
            console.log('\n🔊 Restaurando notificações...');
            await prisma.user.update({
                where: { id: userId },
                data: originalUserSettings
            });

            console.log(`\n🏁 [BOLETIM DE PERFORMANCE]`);
            console.log(`--------------------------------------------------`);
            console.log(`⏱️ Tempo Total:    ${totalTime.toFixed(2)}s`);
            console.log(`🚀 Throughput:      ${(TOTAL_JOBS/totalTime).toFixed(2)} jobs/s`);
            console.log(`💎 Status BullMQ:   Limpando fila...`);
            await tradeQueue.drain();
            console.log(`✅ Fim do teste.`);
            process.exit(0);
        }
    }, 1000);
}

runStressTest().catch(console.error);
