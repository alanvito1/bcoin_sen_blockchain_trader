const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");
const dotenv = require("dotenv");
const path = require("path");

// Configurar dotenv
dotenv.config({ path: path.join(__dirname, "../.env") });

const apiId = parseInt(process.env.TELEGRAM_API_ID || process.env.API_ID);
const apiHash = process.env.TELEGRAM_API_HASH || process.env.API_HASH;
const stringSession = new StringSession(process.env.QA_SESSION_STRING || "");
const botUsername = process.env.TELEGRAM_BOT_USERNAME || "@seu_bot_username";

if (!apiId || !apiHash) {
    console.error("❌ Erro: API_ID e API_HASH devem estar no seu .env");
    process.exit(1);
}

const TIMEOUT_MS = 30000;

async function runQA() {
    console.log("🤖 Iniciando Motor de QA Crawler (MTProto)...");

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await askInput("📱 Digite seu número de telefone (com DDI): "),
        password: async () => await askInput("🔐 Digite sua senha (se houver 2FA): "),
        phoneCode: async () => await askInput("🔢 Digite o código OTP enviado pelo Telegram: "),
        onError: (err) => console.log("Login Error: ", err),
    });

    console.log("✅ Conectado com sucesso!");
    
    // Obter ID real do bot para evitar erros de reconhecimento
    const botEntity = await client.getEntity(botUsername);
    const botId = botEntity.id.toString();
    console.log(`🤖 Bot identificado: ${botUsername} (ID: ${botId})`);

    // --- FASE 1: ENTRADA E TERMOS ---
    console.log(`🚀 [Setup] Enviando /start para ${botUsername}...`);
    await client.sendMessage(botUsername, { message: "/start" });
    
    // Aguarda qualquer resposta do bot para detectar Terms ou Menu
    let response = await waitForResponse(client, botId, ["BOMBER TRADER", "TERMOS DE USO", "Aceito", "BATTLE READY", "SISTEMA DE TRADING", "MULTI-CHAIN"]);
    
    if (!response) {
        console.error("❌ Bot não respondeu ao /start");
        process.exit(1);
    }

    if (response.message.includes('TERMOS DE USO') || response.message.includes('Aceito')) {
        console.log('⚠️ Terms Gate detectado. Aceitando termos...');
        await sendCallback(client, botUsername, response.id, 'accept_terms');
        // Aguarda o menu principal após aceitar
        response = await waitForResponse(client, botId, ["BOMBER TRADER", "BATTLE READY", "SISTEMA DE TRADING", "MULTI-CHAIN"]);
    }

    if (!response || !response.replyMarkup) {
        console.error("❌ Não foi possível carregar o Menu Principal ou o replyMarkup é nulo.");
        process.exit(1);
    }

    console.log("✅ Menu Principal carregado. Iniciando Varredura Dinâmica (Crawler)...");

    // --- FASE 2: CRAWLER DE BOTÕES ---
    const buttons = extractButtons(response.replyMarkup);
    console.log(`\n📋 Botões detectados no Menu Principal: [${buttons.map(b => b.text).join(', ')}]\n`);

    const results = [];

    for (const btn of buttons) {
        console.log(`🔍 Varrendo: [${btn.text}] ...`);
        
        // Clica no botão usando o Buffer original para evitar DATA_INVALID
        await sendCallback(client, botUsername, response.id, btn.raw);
        
        // Aguarda uma resposta genérica para validar que o botão funciona
        const btnResponse = await waitForResponse(client, botId, [], 10000); // 10s timeout
        
        if (btnResponse) {
            console.log(`   ✅ Sucesso: Botão respondendo.`);
            results.push({ name: btn.text, status: "SUCESSO" });
        } else {
            console.log(`   ⚠️ Alerta: Botão não gerou resposta visual (ou timeout).`);
            results.push({ name: btn.text, status: "SEM RESPOSTA" });
        }
        
        // Pequena pausa entre cliques para evitar FloodWait (Rate Limit) do Telegram
        console.log("⏳ Aguardando 2s para evitar Rate Limit...");
        await sleep(2000);
    }

    // --- RELATÓRIO FINAL ---
    console.log("\n==========================================");
    console.log("📊 RELATÓRIO DE VARREDURA (CRAWLER)");
    console.log("==========================================");
    results.forEach(r => {
        const icon = r.status === "SUCESSO" ? "✅" : "❌";
        console.log(`${icon} ${r.name.padEnd(25)} : ${r.status}`);
    });
    console.log("==========================================\n");

    console.log("[✅ QA CRAWLER FINISHED]");
    process.exit(0);
}

/**
 * Helper Sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extrai callbackData e Texto de todos os botões no replyMarkup
 */
function extractButtons(replyMarkup) {
    const buttons = [];
    if (replyMarkup && replyMarkup.rows) {
        replyMarkup.rows.forEach(row => {
            row.buttons.forEach(btn => {
                if (btn.data) {
                    buttons.push({
                        text: btn.text,
                        raw: btn.data // Mantém o Buffer original para o GramJS
                    });
                }
            });
        });
    }
    return buttons;
}

async function sendCallback(client, peer, msgId, data) {
    try {
        await client.invoke(
            new Api.messages.GetBotCallbackAnswer({
                peer: peer,
                msgId: msgId,
                data: data, // Passagem direta do Buffer
            })
        );
    } catch (e) {
        console.warn(`⚠️ Erro no callback: ${e.message}`);
    }
}

async function waitForResponse(client, botId, keywords, timeout = TIMEOUT_MS) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            client.removeEventHandler(handler);
            resolve(null);
        }, timeout);

        const handler = (event) => {
            const message = event.message;
            if (message) {
                const senderId = message.senderId ? message.senderId.toString() : null;
                // console.log(`[DEBUG] Recebido de ${senderId}: ${message.message.substring(0, 50)}...`);

                if (senderId === botId) {
                    // Se keywords for vazio, aceita qualquer mensagem (usado no crawler)
                    const text = message.message || "";
                    const found = keywords.length === 0 || keywords.some(k => text.includes(k));
                    
                    if (found) {
                        clearTimeout(timer);
                        client.removeEventHandler(handler);
                        resolve(message);
                    }
                }
            }
        };

        client.addEventHandler(handler);
    });
}

function askInput(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, answer => {
        rl.close();
        resolve(answer);
    }));
}

runQA().catch(err => {
    console.error("💥 Erro crítico no Crawler:", err);
    process.exit(1);
});
