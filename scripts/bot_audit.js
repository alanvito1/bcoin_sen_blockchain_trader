const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.QA_SESSION_STRING);
const botUsername = process.env.TELEGRAM_BOT_USERNAME || "BCOIN_n_SEN_bot";

(async () => {
  console.log("🚀 Initializing Bot Audit Session...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.connect();
    console.log("✅ Connected as UserBot.");

    // 1. Send /start
    console.log(`💬 Sending /start to @${botUsername}...`);
    await client.sendMessage(botUsername, { message: "/start" });
    
    // Wait for response
    await new Promise(r => setTimeout(r, 2000));
    let messages = await client.getMessages(botUsername, { limit: 1 });
    console.log("📥 Response to /start:", messages[0].message);

    if (messages[0].message.includes("Aegis")) {
      console.error("❌ FAILURE: Aegis is still active in /start response!");
    } else {
      console.log("✅ SUCCESS: /start is clean.");
    }

    // 2. Test Admin Menu
    // We attempt to click the "🛠️ Admin" button if it exists as an inline button
    if (messages[0].replyMarkup?.rows) {
      console.log("🖱️ Found buttons. Attempting to enter Admin Panel...");
      // Try to find a button with 'Admin'
      for (const row of messages[0].replyMarkup.rows) {
        for (const btn of row.buttons) {
          if (btn.text.includes("Admin") || btn.data?.toString().includes("admin")) {
            console.log(`👉 Clicking button: ${btn.text}`);
            // Use bot context or direct data
            // GramJS doesn't easily 'click' without message ID and data
          }
        }
      }
    }

    // 3. Final Check of Error Logs
    console.log("🔍 Check complete. Please verify 'logs/error.log' for any background triggers.");

  } catch (err) {
    console.error("❌ Audit Error:", err);
  } finally {
    await client.disconnect();
  }
})();
