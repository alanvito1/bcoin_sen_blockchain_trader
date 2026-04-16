const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const dotenv = require('dotenv');
dotenv.config();

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const sessionString = process.env.QA_SESSION_STRING;
const botUsername = process.env.TELEGRAM_BOT_USERNAME || '@BCOIN_n_SEN_bot';

(async () => {
    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {});
    await client.connect();
    
    console.log('Resetting...');
    await client.sendMessage(botUsername, { message: '/start' });
    await new Promise(r => setTimeout(r, 4000));
    
    let messages = await client.getMessages(botUsername, { limit: 1 });
    let msg = messages[0];
    
    console.log('Clicking Arena...');
    if (msg.replyMarkup && msg.replyMarkup.rows) {
        const btn = msg.replyMarkup.rows.flatMap(r => r.buttons).find(b => b.text.includes('Arena'));
        if (btn) {
            await msg.click({ button: btn });
            await new Promise(r => setTimeout(r, 5000));
            
            messages = await client.getMessages(botUsername, { limit: 1 });
            console.log('TEXT:', messages[0].message);
            console.log('INCLUI Arena:', messages[0].message.includes('Arena'));
        } else {
            console.log('Button not found');
        }
    }
    
    await client.disconnect();
})();
