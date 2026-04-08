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

    const delay = 3500;
    console.log(`⏳ Aguardando ${delay/1000}s para propagação e resposta...`);
    await new Promise(r => setTimeout(r, delay));

    console.log("📥 Buscando histórico de mensagens (getMessages)...");
    const messages = await client.getMessages(botUsername, { limit: 1 });
    
    if (messages && messages.length > 0) {
        const lastMsg = messages[0];
        const isFromBot = lastMsg.peerId && lastMsg.peerId.userId && lastMsg.peerId.userId.toString() === botId;
        const isIncoming = !lastMsg.out;

        console.log("\n========================================");
        console.log("📬 ÚLTIMA MENSAGEM NO CHAT:");
        console.log(`De: ${isFromBot ? botUsername : 'Eu'}`);
        console.log(`ID Mensagem: ${lastMsg.id}`);
        console.log(`Conteúdo: ${lastMsg.message.substring(0, 150)}${lastMsg.message.length > 150 ? '...' : ''}`);
        console.log("========================================\n");

        if (isIncoming && isFromBot) {
            console.log("✅ [PONG] SUCESSO! O Bot respondeu corretamente.");
            await client.disconnect();
            process.exit(0);
        } else {
            console.error("❌ [FALHA] A última mensagem não é uma resposta do Bot (Incoming).");
            console.log("Dica: Verifique se o Bot está rodando na VPS.");
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
