const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    console.log('🔍 [SUPER AUDIT V2] Iniciando auditoria resiliente...');

    try {
        console.log('\n--- 👥 USUÁRIOS NO BANCO ---');
        const users = await prisma.user.findMany();
        console.log(`Total de usuários: ${users.length}`);

        for (const u of users) {
            console.log(`\n👤 Usuário: ${u.username || 'Sem-Nome'} (ID: ${u.id})`);
            console.log(`   - TelegramId: ${u.telegramId.toString()}`);
            
            // Busca manuais para evitar erros de relação se o Client estiver bugado
            const wallet = await prisma.wallet.findUnique({ where: { userId: u.id } }).catch(() => null);
            const configs = await prisma.tradeConfig.findMany({ where: { userId: u.id } }).catch(() => []);

            console.log(`   - Wallet: ${wallet ? wallet.publicAddress : '❌ Nenhuma'}`);
            console.log(`   - TradeConfigs: ${configs.length} encontrada(s)`);
            
            if (configs.length > 0) {
                configs.forEach(c => {
                    console.log(`     └─ [${c.network}] ${c.tokenPair} (Active: ${c.isOperating}, DryRun: ${c.dryRun})`);
                });
            }
        }

        console.log('\n--- 🔑 SESSÕES NO REDIS/DB ---');
        const sessions = await prisma.session.findMany().catch(() => []);
        console.log(`Total de sessões persistidas: ${sessions.length}`);
        sessions.forEach(s => {
            console.log(`   - Key: ${s.key}`);
        });

        console.log('\n--- 🛠️ VERIFICAÇÃO DE INTEGRIDADE ---');
        const allWallets = await prisma.wallet.findMany();
        const orphans = allWallets.filter(w => !users.some(u => u.id === w.userId));
        if (orphans.length > 0) {
            console.log(`⚠️ Alerta: ${orphans.length} wallets sem usuário associado!`);
        } else {
            console.log('✅ Nenhuma wallet órfã detectada.');
        }

    } catch (error) {
        console.error('❌ Erro Crítico na Auditoria:', error);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
