const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const prisma = require('../src/config/prisma');
const { Queue } = require('bullmq');
const redisConnection = require('../src/config/redis');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.QA_SESSION_STRING;
const botUsername = process.env.TELEGRAM_BOT_USERNAME || '@BCOIN_n_SEN_bot';

async function runDryRunTest() {
    console.log('🧪 [DRY RUN] Iniciando Teste de Simulação de Combate...');

    if (!sessionString) {
        console.error('❌ QA_SESSION_STRING ausente.');
        process.exit(1);
    }

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.connect();
        console.log('✅ MTProto Conectado.');

        // 1. Setup DB for Dry Run
        console.log('💾 Ativando modo DRY RUN no banco de dados...');
        const config = await prisma.tradeConfig.findFirst({
            where: { tokenPair: 'BCOIN/USDT', network: 'BSC' }
        });

        if (!config) {
            throw new Error('Configuração BCOIN/USDT não encontrada.');
        }

        await prisma.tradeConfig.update({
            where: { id: config.id },
            data: { dryRun: true, isOperating: true }
        });

        // 2. Inject Job into BullMQ
        console.log('🚀 Injetando Job de trade na fila (MOCK TRIGGER)...');
        const tradeQueue = new Queue('tradeQueue', { connection: redisConnection });
        
        await tradeQueue.add('executeTrade', {
            userId: config.userId,
            tradeConfigId: config.id,
            walletId: (await prisma.wallet.findUnique({ where: { userId: config.userId } })).id
        });

        console.log('⏳ Aguardando notificação [DRY RUN] no Telegram...');
        
        // 3. Listen for message
        let found = false;
        const startTime = Date.now();
        
        while (Date.now() - startTime < 60000) { // 60s timeout
            const messages = await client.getMessages(botUsername, { limit: 5 });
            for (const msg of messages) {
                if (msg.message && msg.message.includes('[DRY RUN]') && msg.date * 1000 > startTime) {
                    console.log('\n🏆 [SUCCESS] Notificação Dry Run Recebida!');
                    console.log('------------------------------------------');
                    console.log(msg.message);
                    console.log('------------------------------------------\n');
                    found = true;
                    break;
                }
            }
            if (found) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!found) {
            console.error('❌ Timeout: Notificação [DRY RUN] não recebida.');
        }

    } catch (err) {
        console.error('💥 Falha no teste Dry Run:', err);
    } finally {
        // Reset Dry Run
        await prisma.tradeConfig.updateMany({
            where: { tokenPair: 'BCOIN/USDT' },
            data: { dryRun: false }
        }).catch(() => {});

        await client.disconnect();
        await prisma.$disconnect();
        process.exit(0);
    }
}

runDryRunTest();
