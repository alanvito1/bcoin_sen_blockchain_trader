const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

// Configurações da Carteira de Teste (Mock)
const TEST_TELEGRAM_ID = 1692505402n; // O seu ID encontrado na auditoria
const MOCK_PUBLIC_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';

// Função de criptografia (precisa bater com o que o src/utils/encryption.js usa)
function encrypt(text) {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        throw new Error('ENCRYPTION_KEY inválida ou ausente no .env');
    }
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag
    };
}

async function fix() {
    console.log(`🛠️ [FIX] Iniciando reparo para Telegram ID: ${TEST_TELEGRAM_ID}...`);

    try {
        const user = await prisma.user.findUnique({
            where: { telegramId: TEST_TELEGRAM_ID }
        });

        if (!user) {
            console.log('❌ Usuário não encontrado!');
            return;
        }

        console.log(`✅ Usuário encontrado: ${user.username} (ID: ${user.id})`);

        // 1. Criar Carteira se não existir
        const existingWallet = await prisma.wallet.findUnique({
            where: { userId: user.id }
        });

        if (existingWallet) {
            console.log(`⚠️ Usuário já possui carteira: ${existingWallet.publicAddress}`);
        } else {
            console.log('📦 Gerando carteira de teste criptografada...');
            const { encrypted, iv, authTag } = encrypt(MOCK_PRIVATE_KEY);
            
            await prisma.wallet.create({
                data: {
                    userId: user.id,
                    publicAddress: MOCK_PUBLIC_ADDRESS,
                    encryptedPrivateKey: encrypted,
                    iv: iv,
                    authTag: authTag,
                    network: 'POLYGON'
                }
            });
            console.log('✅ Carteira vinculada com sucesso!');
        }

        // 2. Limpar Sessão para forçar refresh do bot
        console.log('🧹 Limpando sessões para destravar bot...');
        await prisma.session.deleteMany({
            where: { key: { startsWith: TEST_TELEGRAM_ID.toString() } }
        });
        console.log('✅ Sessões limpas.');

        console.log('\n🚀 REPARO CONCLUÍDO! O motor agora deve detectar a carteira.');

    } catch (error) {
        console.error('❌ Erro no reparo:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fix();
