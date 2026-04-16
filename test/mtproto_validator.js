const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const dotenv = require("dotenv");
const path = require("path");

// Carregar .env da raiz
dotenv.config({ path: path.join(__dirname, "../.env") });

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.QA_SESSION_STRING || "");

if (!apiId || !apiHash) {
    console.error("❌ Erro: API_ID ou API_HASH não encontrados no .env");
    process.exit(1);
}

(async () => {
    console.log("🔍 [QA] Iniciando auditoria de sessão MTProto...");
    console.log(`API ID: ${apiId}`);
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 3,
        timeout: 10000
    });

    try {
        await client.connect();
        const me = await client.getMe();
        console.log("\n========================================");
        console.log("✅ STATUS: SESSÃO 100% VIVA!");
        console.log(`👤 Usuário: ${me.firstName} ${me.lastName || ""}`);
        console.log(`🆔 ID: ${me.id}`);
        console.log(`📱 Username: @${me.username}`);
        console.log("========================================\n");
        process.exit(0);
    } catch (error) {
        console.log("\n========================================");
        console.log("❌ STATUS: SESSÃO CORROMPIDA OU EXPIRADA");
        console.log(`Erro: ${error.message}`);
        console.log("========================================\n");
        process.exit(1);
    }
})();
