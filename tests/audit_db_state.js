const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
    console.log('🔍 [SUPER AUDIT] Iniciando auditoria profunda...');

    try {
        console.log('\n--- VERIFICAÇÃO DE USUÁRIOS E WALLETS ---');
        const users = await prisma.user.findMany({
            include: {
                wallet: true,
                tradeConfigs: true
            }
        });

        if (users.length === 0) {
            console.log('⚠️ Nenhum usuário encontrado no banco!');
        } else {
            users.forEach(u => {
                console.log(`👤 Usuário: ${u.username || 'Sem-Nome'} (ID: ${u.id})`);
                console.log(`   - Telegram ID: ${u.telegramId}`);
                console.log(`   - Wallet: ${u.wallet ? u.wallet.address : '❌ Nenhuma'}`);
                console.log(`   - Configs: ${u.tradeConfigs.length} ativa(s)`);
                if (u.wallet) {
                    console.log(`   - Wallet Decrypt Test: (Encr: ${u.wallet.privateKey.substring(0, 10)}...)`);
                }
            });
        }

        console.log('\n--- VERIFICAÇÃO DE SESSÕES ---');
        const sessions = await prisma.session.findMany();
        console.log(`Total de Sessões Ativas: ${sessions.length}`);
        sessions.forEach(s => {
            try {
                const data = JSON.parse(s.data);
                console.log(`🔑 Key: ${s.key}`);
                // Safely log scene name if it exists (telegraf/grammy style)
                const scene = data.__telegraf?.scenes?.current || data.scene || 'Nenhuma';
                console.log(`   - Cena Atual: ${scene}`);
            } catch (e) {
                console.log(`   - Key: ${s.key} (Erro ao parsear data)`);
            }
        });

        console.log('\n--- VERIFICAÇÃO DE WALLETS ÓRFÃS ---');
        const wallets = await prisma.wallet.findMany();
        const orphanWallets = wallets.filter(w => !users.some(u => u.id === w.userId));
        console.log(`Wallets Órfãs: ${orphanWallets.length}`);

    } catch (error) {
        console.error('❌ Erro na auditoria:', error);
    } finally {
        await prisma.$disconnect();
    }
}

audit();
