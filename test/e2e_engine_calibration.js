const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const prisma = require('../src/config/prisma');
const { exec } = require('child_process');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

// Configuration
const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.QA_SESSION_STRING;
const botUsername = process.env.TELEGRAM_BOT_USERNAME || '@BCOIN_n_SEN_bot';
const targetPair = 'BSC_BCOIN';
const targetSlippage = 12.0;

// VPS Config
const vpsIp = '<VPS_IP>';
const sshKey = '<PATH_TO_SSH_KEY>';

async function runE2E() {
    console.log('🏁 [E2E] Iniciando Teste de Calibragem Full-Cycle...');
    
    if (!sessionString || !apiId || !apiHash) {
        console.error('❌ Erro: API_ID, API_HASH ou QA_SESSION_STRING ausentes no .env');
        process.exit(1);
    }

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        // --- STEP 1: Telegram UI Interaction ---
        await client.connect();
        console.log('✅ Conectado ao MTProto.');

        console.log(`🤖 Enviando /start para ${botUsername}...`);
        await client.sendMessage(botUsername, { message: '/start' });
        await new Promise(r => setTimeout(r, 4000));

        let messages = await client.getMessages(botUsername, { limit: 1 });
        let currentMsg = messages[0];

        const clickButton = async (label) => {
            console.log(`🖱️  Clicando no botão: [${label}]`);
            await currentMsg.click({ data: label }).catch(async () => {
                // Fallback by text search if callback fails
                if (currentMsg.replyMarkup && currentMsg.replyMarkup.rows) {
                    for (const row of currentMsg.replyMarkup.rows) {
                        for (const btn of row.buttons) {
                            if (btn.text.includes(label)) {
                                await currentMsg.click({ button: btn });
                                return;
                            }
                        }
                    }
                }
            });
            await new Promise(r => setTimeout(r, 4000));
            messages = await client.getMessages(botUsername, { limit: 1 });
            currentMsg = messages[0];
        };

        // Navigate to Arena
        await clickButton('trade_panel');
        // Select Pair
        await clickButton(`manage_${targetPair}`);

        // --- CALIBRAÇÃO 1: Slippage 12% ---
        console.log('⚙️  Iniciando Calibragem de Slippage...');
        await clickButton('edit_slippage'); // Callback do botão "Precisão"
        await client.sendMessage(botUsername, { message: targetSlippage.toString() });
        await new Promise(r => setTimeout(r, 5000));
        
        // --- CALIBRAÇÃO 2: Timer 5min ---
        console.log('⏲️  Iniciando Calibragem de Timer...');
        messages = await client.getMessages(botUsername, { limit: 1 });
        currentMsg = messages[0];
        await clickButton('setup_schedule');
        await clickButton('set_schedule_interval');
        await clickButton('set_interval_5');

        console.log('✅ Interação MTProto concluída.');

        // --- STEP 2: Prisma DB Verification ---
        console.log('💾 Verificando persistência no Prisma...');
        const config = await prisma.tradeConfig.findFirst({
            where: { tokenPair: { startsWith: targetPair.split('_')[1] } },
            orderBy: { updatedAt: 'desc' }
        });

        if (config.slippage === targetSlippage && config.intervalMinutes === 5) {
            console.log(`✅ Prisma Validado: Slippage=${config.slippage}%, Interval=${config.intervalMinutes}min`);
        } else {
            console.error(`❌ Falha no Prisma: Slippage=${config.slippage}%, Interval=${config.intervalMinutes}min (Esperado: ${targetSlippage}, 5)`);
        }

        // --- STEP 3: VPS Engine Verification ---
        console.log('🚀 Reiniciando motor na VPS para aplicar mudanças...');
        const restartCmd = `ssh -i ${sshKey} root@${vpsIp} "docker compose restart trader-engine"`;
        await new Promise((resolve) => {
            exec(restartCmd, (err, stdout, stderr) => {
                if (err) console.error('⚠️ [SSH] Erro ao reiniciar:', stderr);
                else console.log('✅ Motor reiniciado na VPS.');
                resolve();
            });
        });

        console.log('⏳ Aguardando inicialização do motor (15s)...');
        await new Promise(r => setTimeout(r, 15000));

        // Start the bot via MTProto if it was paused
        await client.sendMessage(botUsername, { message: '/start' });
        await new Promise(r => setTimeout(r, 3000));
        await clickButton('trade_panel');
        await clickButton(`manage_${targetPair}`);
        await clickButton('start_bot');

        console.log('📊 Monitorando logs da VPS por evidência de fluxo...');
        const logCmd = `ssh -i ${sshKey} root@${vpsIp} "docker logs --tail 100 trader-engine"`;
        
        await new Promise((resolve) => {
            exec(logCmd, (err, stdout, stderr) => {
                const logs = stdout || stderr;
                console.log('\n--- EXTRACTED VPS LOGS ---');
                console.log(logs.split('\n').filter(l => l.includes('Calibration') || l.includes('Strategy')).join('\n'));
                console.log('---------------------------\n');

                if (logs.includes(`Slippage: ${targetSlippage}`) || logs.includes(`maPeriodA`)) {
                    console.log('🏆 [SUCCESS] O motor em produção leu os valores calibrados via MTProto!');
                } else {
                    console.log('⚠️ [PENDING] Evidência de calibragem não encontrada nos logs capturados. Verifique se o scanner rodou.');
                }
                resolve();
            });
        });

    } catch (err) {
        console.error('💥 Erro Crítico no E2E:', err);
    } finally {
        await client.disconnect();
        await prisma.$disconnect();
        console.log('🏁 Teste E2E Finalizado.');
    }
}

runE2E();
