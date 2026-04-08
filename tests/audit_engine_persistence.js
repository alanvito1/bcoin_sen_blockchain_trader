const prisma = require('../src/config/prisma');
const strategy = require('../src/services/tradingStrategy');
const logger = require('../src/utils/logger');

async function auditPersistence() {
    console.log('🔍 [Audit] Iniciando Auditoria de Persistência...');

    // 1. Setup Mock User & Config
    const user = await prisma.user.findFirst({
        include: { tradeConfigs: true }
    });

    if (!user || user.tradeConfigs.length === 0) {
        console.error('❌ Falha: Nenhum usuário ou tradeConfig encontrado no banco local.');
        process.exit(1);
    }

    const config = user.tradeConfigs[0];
    const originalMa = config.maPeriodA;
    const testMa = 55; // Diferente do padrão 21

    console.log(`📊 [Config Original] ID: ${config.id} | Par: ${config.tokenPair}`);
    console.log(`📉 MA Period A: ${originalMa}`);

    try {
        // 2. Update to a specific test value
        console.log(`🧪 [Teste] Alterando MA Period A para ${testMa}...`);
        await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { maPeriodA: testMa }
        });

        // 3. Call Strategy Signal Generation
        console.log('📡 [Strategy] Gerando sinal...');
        const updatedConfig = await prisma.tradeConfig.findUnique({ where: { id: config.id } });
        const result = await strategy.getSignal(config.tokenPair, updatedConfig);

        console.log('✅ [Resultado] Sinal:', result.signal);
        console.log('📝 [Motivo]:', result.reason);

        if (result.reason.includes(`MA${testMa}`)) {
            console.log('🎉 SUCESSO: O motor leu o MA Period customizado do banco!');
        } else {
            console.error('❌ FALHA: O motor ainda parece estar usando o valor padrão ou ignorando o banco.');
        }

    } catch (err) {
        console.error('💥 Erro durante a auditoria:', err);
    } finally {
        // Restore original value
        await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { maPeriodA: originalMa }
        });
        await prisma.$disconnect();
    }
}

auditPersistence();
