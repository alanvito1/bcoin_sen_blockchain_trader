const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const dotenv = require("dotenv");
const path = require("path");

// Load .env
dotenv.config({ path: path.join(__dirname, "../.env") });

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.QA_SESSION_STRING || "");
const botUsername = process.env.TELEGRAM_BOT_USERNAME || "@BCOIN_n_SEN_bot";

if (!apiId || !apiHash) {
    console.error("❌ Error: API_ID and API_HASH must be in your .env");
    process.exit(1);
}

async function pingPong() {
    console.log("🏓 [Phase 2] Iniciando Teste Ping-Pong (Histórico MTProto)...");

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    console.log("📡 Conectando ao Telegram...");
    await client.connect();
    console.log("✅ Conexão estabelecida!");

    const botEntity = await client.getEntity(botUsername);
    const botId = botEntity.id.toString();
    console.log(`🤖 Bot Alvo: ${botUsername} (ID: ${botId})`);

    console.log(`🚀 Enviando /start para ${botUsername}...`);
    await client.sendMessage(botUsername, { message: "/start" });

    const delay = 7000;
    console.log(`⏳ Aguardando ${delay/1000}s para propagação e resposta...`);
    await new Promise(r => setTimeout(r, delay));

    console.log("📥 Buscando histórico de mensagens (últimas 3)...");
    const messages = await client.getMessages(botUsername, { limit: 3 });
    
    if (messages && messages.length > 0) {
        console.log("\n--- Auditoria de Histórico ---");
        let foundResponse = false;
        
        for (const msg of messages) {
            const senderId = msg.senderId ? msg.senderId.toString() : "N/A";
            const isIncoming = !msg.out;
            console.log(`[${isIncoming ? 'IN' : 'OUT'}] De: ${senderId} | Texto: ${msg.message.substring(0, 50).replace(/\n/g, ' ')}...`);

            // Se for incoming e o sender for o bot (ou se for diferente de nós)
            if (isIncoming && senderId === botId) {
                console.log("\n========================================");
                console.log("✅ [PONG] SUCESSO! Resposta encontrada no histórico.");
                console.log(`Conteúdo: ${msg.message.substring(0, 150)}...`);
                console.log("========================================\n");
                foundResponse = true;
                break;
            }
        }

        if (foundResponse) {
            await client.disconnect();
            process.exit(0);
        } else {
            console.error("\n❌ [FALHA] Nenhuma resposta do Bot encontrada nas últimas 3 mensagens.");
            console.log(`Bot Alvo ID: ${botId}`);
            await client.disconnect();
            process.exit(1);
        }
    } else {
        console.error("❌ [ERRO] Nenhuma mensagem encontrada no chat.");
        await client.disconnect();
        process.exit(1);
    }
}

pingPong().catch(err => {
    console.error("💥 Erro Crítico:", err);
    process.exit(1);
});
