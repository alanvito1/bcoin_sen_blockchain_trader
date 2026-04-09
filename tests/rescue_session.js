const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function rescue(targetId = null) {
    console.log('👷 [SESSION RESCUE] Iniciando resgate de emergência...');

    try {
        if (!targetId) {
            console.log('⚠️ Nenhum ID especificado. Listando sessões ativas...');
            const sessions = await prisma.session.findMany();
            if (sessions.length === 0) {
                console.log('✅ Nenhuma sessão encontrada no banco.');
            } else {
                console.log(`Encontradas ${sessions.length} sessões:`);
                sessions.forEach(s => console.log(` - Key: ${s.key}`));
            }
            return;
        }

        console.log(`🗑️ Removendo sessões para o ID: ${targetId}...`);
        
        // Deletamos qualquer chave que contenha o ID (match em from.id:chat.id)
        const deleted = await prisma.session.deleteMany({
            where: {
                key: {
                    contains: targetId.toString()
                }
            }
        });

        console.log(`✅ Sucesso! ${deleted.count} entrada(s) de sessão removidas.`);
        console.log('💡 O usuário agora pode enviar /start para recarregar o menu do bot.');

    } catch (error) {
        console.error('❌ Erro no resgate:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Pega ID dos argumentos ou lista tudo
const argId = process.argv[2];
rescue(argId);
