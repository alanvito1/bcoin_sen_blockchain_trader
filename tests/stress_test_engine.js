const { Queue } = require('bullmq');
const redisConnection = require('../src/config/redis');
const prisma = require('../src/config/prisma');
const dotenv = require('dotenv');

dotenv.config();

async function runStressTest(jobCount = 500) {
    console.log(`\n🚀 [STRESS TEST] Iniciando carga de ${jobCount} jobs...`);
    const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });
    
    console.log('🧹 Limpando fila...');
    await tradeQueue.drain();
    
    // Find first user with a wallet
    const wallet = await prisma.wallet.findFirst();
    if (!wallet) {
        console.error('❌ Nenhuma wallet encontrada no banco.');
        process.exit(1);
    }

    // Find or create a trade config for this user
    let config = await prisma.tradeConfig.findFirst({
        where: { userId: wallet.userId }
    });

    if (!config) {
        config = await prisma.tradeConfig.create({
            data: {
                userId: wallet.userId,
                tokenPair: 'BCOIN/USDT',
                network: 'BSC',
                isOperating: true,
                dryRun: true
            }
        });
    } else {
        await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { dryRun: true, isOperating: true }
        });
    }

    console.log(`🎯 Alvo do Teste: Usuário ${wallet.userId} | ID Config: ${config.id}`);

    const startTime = Date.now();
    const promises = [];
    for (let i = 0; i < jobCount; i++) {
        promises.push(tradeQueue.add('executeTrade', {
            userId: wallet.userId,
            tradeConfigId: config.id,
            walletId: wallet.id,
            isStressTest: true
        }));
    }
    
    await Promise.all(promises);
    console.log(`✅ ${jobCount} jobs injetados.`);

    const monitor = setInterval(async () => {
        const counts = await tradeQueue.getJobCounts('completed', 'failed', 'active', 'wait');
        const processed = counts.completed + counts.failed;
        process.stdout.write(`\r📊 Progresso: ${((processed/jobCount)*100).toFixed(1)}% (${processed}/${jobCount}) [Ativos: ${counts.active}] `);
        
        if (processed >= jobCount) {
            clearInterval(monitor);
            const totalTime = (Date.now() - startTime) / 1000;
            console.log(`\n\n🏁 FIM: ${totalTime.toFixed(2)}s | Throughput: ${(jobCount/totalTime).toFixed(2)} tps`);
            process.exit(0);
        }
    }, 1000);
}

runStressTest(500).catch(console.error);
