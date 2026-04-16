const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.QA_SESSION_STRING;
const botUsername = process.env.TELEGRAM_BOT_USERNAME || '@BCOIN_n_SEN_bot';

const RESULTS = [];

async function runDeepCrawler() {
    console.log('🚀 [DEEP CRAWLER] Inicializando Auditoria de Submenus (Fase 3.5)...');
    
    if (!sessionString) {
        console.error('❌ QA_SESSION_STRING não encontrada no .env');
        process.exit(1);
    }

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 5,
    });

    try {
        await client.connect();
        console.log('✅ Conexão MTProto estabelecida.');

        const botEntity = await client.getEntity(botUsername);
        console.log(`🤖 Bot Alvo: ${botUsername} (ID: ${botEntity.id})\n`);

        const resetToLobby = async () => {
            await client.sendMessage(botUsername, { message: '/start' });
            await new Promise(r => setTimeout(r, 3000));
            let messages = await client.getMessages(botUsername, { limit: 1 });
            let msg = messages[0];

            if (msg.replyMarkup && JSON.stringify(msg.replyMarkup).includes('accept_terms')) {
                console.log('⚖️  Gate de Termos detectado. Aceitando...');
                await msg.click({ data: 'accept_terms' });
                await new Promise(r => setTimeout(r, 4000));
                let reload = await client.getMessages(botUsername, { limit: 1 });
                msg = reload[0];
            }
            return msg;
        };

        const runMission = async (name, steps) => {
            console.log(`\n🚩 [MISSAO] ${name}`);
            let currentMsg = await resetToLobby();
            let success = true;
            let log = '';

            try {
                for (const step of steps) {
                    console.log(`   🔸 Passo: "${step.label}"`);
                    
                    let buttonToClick = null;
                    if (currentMsg.replyMarkup && currentMsg.replyMarkup.rows) {
                        for (const row of currentMsg.replyMarkup.rows) {
                            for (const btn of row.buttons) {
                                // Match by text snippet or exact callback
                                if (btn.text.includes(step.label) || (step.callback && btn.data && btn.data.toString('utf8') === step.callback)) {
                                    buttonToClick = btn;
                                    break;
                                }
                            }
                            if (buttonToClick) break;
                        }
                    }

                    if (!buttonToClick) {
                        // Fallback: search for button text case insensitive
                        if (currentMsg.replyMarkup && currentMsg.replyMarkup.rows) {
                            for (const row of currentMsg.replyMarkup.rows) {
                                for (const btn of row.buttons) {
                                    if (btn.text.toLowerCase().includes(step.label.toLowerCase())) {
                                        buttonToClick = btn;
                                        break;
                                    }
                                }
                                if (buttonToClick) break;
                            }
                        }
                    }

                    if (!buttonToClick) {
                        console.error(`      ❌ ERRO: Botão "${step.label}" não encontrado no menu.`);
                        success = false;
                        log = `Botão não encontrado: ${step.label}`;
                        break;
                    }

                    // Click specific button
                    await currentMsg.click({ button: buttonToClick });
                    await new Promise(r => setTimeout(r, 5000));
                    
                    const messages = await client.getMessages(botUsername, { limit: 1 });
                    currentMsg = messages[0];
                    const text = currentMsg.message || '';

                    if (step.verify(text, currentMsg.replyMarkup)) {
                        console.log(`      ✅ Sucesso!`);
                    } else {
                        console.error(`      ❌ FALHA: Verificação de UI falhou.`);
                        console.error(`      📖 Texto: "${text.slice(0, 100).replace(/\n/g, ' ')}..."`);
                        success = false;
                        log = `Falha na verificação em "${step.label}"`;
                        break;
                    }
                }
            } catch (err) {
                console.error(`      💥 ERRO: ${err.message}`);
                success = false;
                log = err.message;
            }

            RESULTS.push({ Missão: name, Status: success ? '✅ OK' : '❌ FALHA', Detalhes: success ? 'Navegação Completa' : log });
        };

        // --- ROTA A: Carteira ---
        await runMission('ROTA A: Gestão de Inventário', [
            { 
                label: 'Inventário', 
                callback: 'wallet_panel',
                verify: (txt) => txt.includes('Inventário')
            },
            { 
                label: 'Cofre', 
                callback: 'generate_wallet', 
                verify: (txt) => txt.includes('Endereço') || txt.includes('Cofre') || txt.includes('Setor')
            }
        ]);

        // --- ROTA B: Loja ---
        await runMission('ROTA B: Supply & Shop', [
            { 
                label: 'Shop', 
                callback: 'store_panel',
                verify: (txt) => txt.includes('Item Shop')
            },
            { 
                label: '1.000', 
                callback: 'buy_package_p1', 
                verify: (txt, kb) => txt.includes('Canal') || JSON.stringify(kb).includes('POLYGON')
            },
            { 
                label: 'Polygon', 
                callback: 'select_asset_p1_POLYGON', 
                verify: (txt, kb) => txt.includes('Gemas') || JSON.stringify(kb).includes('USDT')
            }
        ]);

        // --- ROTA C: Arena ---
        await runMission('ROTA C: Arena de Combate', [
            { 
                label: 'Arena', 
                callback: 'trade_panel',
                verify: (txt) => /Arena/i.test(txt)
            },
            { 
                label: 'BSC - BCOIN', 
                callback: 'manage_BSC_BCOIN', 
                verify: (txt, kb) => /Mina/i.test(txt) || JSON.stringify(kb).includes('strategy')
            }
        ]);

        console.log('\n=============================================================');
        console.log('📊 RELATÓRIO DE DEEP CRAWLING (FASE 3.5)');
        console.log('=============================================================');
        console.table(RESULTS);
        console.log('=============================================================\n');

    } catch (err) {
        console.error('💥 ERRO FATAL NO CRAWLER:', err);
    } finally {
        await client.disconnect();
    }
}

runDeepCrawler();
