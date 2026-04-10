const { Queue } = require('bullmq');
const redisConnection = require('../src/config/redis');
const prisma = require('../src/config/prisma');
const dotenv = require('dotenv');

dotenv.config();

/**
 * ⚡ STRESS TEST REAL - CONCORRÊNCIA (PASSO 3B)
 * Dispara 5 transações reais simultâneas na BSC (Compra de 1 BCOIN).
 * Objetivo: Validar Nonce Management e estabilidade do RPC.
 */
async function runRealStressTest() {
    console.log(`\n🔥 [STRESS TEST REAL] Iniciando 5 transações simultâneas na BSC Mainnet...`);
    
    const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });
    
    // Find master user
    const wallet = await prisma.wallet.findFirst();
    if (!wallet) {
        console.error('❌ Nenhuma wallet encontrada.');
        process.exit(1);
    }
    const userId = wallet.userId;

    // Configuração do Engine para REAL
    console.log('⚙️ Configurando rota BSC/BCOIN para FOGO REAL...');
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
            data: { dryRun: false, isOperating: true, buyAmountA: 1.0 }
        });
    }

    console.log(`🚀 Disparando 5 jobs simultâneos...`);
    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < 5; i++) {
        promises.push(tradeQueue.add('executeTrade', {
            userId,
            tradeConfigId: config.id,
            walletId: wallet.id,
            forceSignal: 'buy',
            forceStrategy: 'A',
            isStressTest: true,
            nonceOffset: i // Se o motor suportar offset, passamos aqui
        }, {
            attempts: 1,
            removeOnComplete: false // Queremos ver os logs das transações
        }));
    }

    const jobs = await Promise.all(promises);
    console.log(`✅ ${jobs.length} jobs injetados na fila.`);

    const monitor = setInterval(async () => {
        const counts = await tradeQueue.getJobCounts('completed', 'failed', 'active', 'wait');
        const processed = counts.completed + counts.failed;
        
        process.stdout.write(`\r📊 Progresso: ${processed}/5 [Ativos: ${counts.active}] `);
        
        if (processed >= 5) {
            clearInterval(monitor);
            console.log(`\n\n🏁 FIM DO TESTE REAL.`);
            console.log(`Verifique os logs do worker para status dos hashes e nonces.`);
            process.exit(0);
        }
    }, 2000);
}

runRealStressTest().catch(console.error);
