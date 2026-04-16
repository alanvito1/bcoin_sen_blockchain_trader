const { Queue } = require('bullmq');
const redisConnection = require('../src/config/redis');
const prisma = require('../src/config/prisma');

async function runRealStressTest() {
    console.log(`\n🚀 [STRESS TEST REAL] Iniciando 5 transações simultâneas de compra de BCOIN (Mainnet)...`);
    
    const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });
    
    const wallet = await prisma.wallet.findFirst();
    if (!wallet) {
        console.error('❌ Nenhuma wallet encontrada no banco.');
        process.exit(1);
    }
    const userId = wallet.userId;
    
    // Config BCOIN/USDT na BSC
    let config = await prisma.tradeConfig.findFirst({
        where: { userId, network: 'BSC', tokenPair: 'BCOIN/USDT' }
    });

    if (!config) {
        config = await prisma.tradeConfig.create({
            data: {
                userId,
                network: 'BSC',
                tokenPair: 'BCOIN/USDT',
                isOperating: true,
                dryRun: false,
                buyAmountA: 1.0,
                sellAmountA: 1.0,
                buyAmountB: 1.0,
                sellAmountB: 1.0,
                slippage: 10.0
            }
        });
    } else {
        await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { dryRun: false, isOperating: true }
        });
    }

    // Injetar 5 trades reais simultâneos!
    const TOTAL_JOBS = 5;
    const promises = [];
    for (let i = 0; i < TOTAL_JOBS; i++) {
        promises.push(tradeQueue.add('executeTrade', {
            userId,
            tradeConfigId: config.id,
            walletId: wallet.id,
            forceSignal: 'buy', // Forçando sinal de compra
            isStressTest: false, // Deixar passar regras de blockchain
        }, {
            attempts: 1,
            removeOnComplete: false,
            removeOnFail: false
        }));
    }

    await Promise.all(promises);
    console.log(`✅ ${TOTAL_JOBS} Jobs de COMPRA (BCOIN) injetados com sucesso.`);
    console.log('Monitorando Fila de Processamento e Transações na Blockchain...\n');

    let processedCount = 0;
    const monitor = setInterval(async () => {
        const counts = await tradeQueue.getJobCounts('completed', 'failed', 'active', 'wait');
        const processed = counts.completed + counts.failed;
        
        process.stdout.write(`\r📊 BullMQ: Concluídos/Falhos: ${processed}/${TOTAL_JOBS} [Ativos: ${counts.active}, Aguardando: ${counts.wait}] `);
        
        if (processed >= TOTAL_JOBS && counts.active === 0 && counts.wait === 0) {
            clearInterval(monitor);
            
            console.log(`\n\n🔍 Buscando hashes no histórico do banco de dados...`);
            const history = await prisma.tradeHistory.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: TOTAL_JOBS
            });

            console.log(`\n🏁 [RELATÓRIO DE TRANSAÇÕES REAIS]`);
            console.log(`--------------------------------------------------`);
            history.forEach((h, index) => {
                console.log(`[Tx ${index + 1}] Operação: ${h.type} | Hash: ${h.txHash || 'FALHOU'} | Status: ${h.status}`);
            });
            console.log(`--------------------------------------------------`);

            // Retornar dryRun para segurança:
            await prisma.tradeConfig.update({
                where: { id: config.id },
                data: { dryRun: true }
            });
            console.log('🛡️ Operação de Stress Finalizada. config devolvida para DRy RUN por segurança.');
            process.exit(0);
        }
    }, 2000);
}

runRealStressTest().catch(err => {
    console.error('Erro no script:', err);
    process.exit(1);
});
