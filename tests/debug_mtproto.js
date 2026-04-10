const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const dotenv = require('dotenv');
dotenv.config();

async function debug() {
    console.log('--- DEBUG MTPROTO ---');
    console.log('API_ID:', process.env.API_ID);
    console.log('Bot:', process.env.TELEGRAM_BOT_USERNAME);
    
    const client = new TelegramClient(
        new StringSession(process.env.QA_SESSION_STRING), 
        parseInt(process.env.API_ID), 
        process.env.API_HASH, 
        { connectionRetries: 5 }
    );

    try {
        await client.connect();
        console.log('✅ Connected');
        
        console.log('Fetching Me...');
        const me = await client.getMe();
        console.log('✅ Me:', me.firstName, me.id);
        
        console.log('Fetching Bot:', process.env.TELEGRAM_BOT_USERNAME || '@BCOIN_n_SEN_bot');
        const bot = await client.getEntity(process.env.TELEGRAM_BOT_USERNAME || '@BCOIN_n_SEN_bot');
        console.log('✅ Bot Found:', bot.id);
        
    } catch (err) {
        console.error('❌ FAILURE:', err);
    } finally {
        await client.disconnect();
        process.exit();
    }
}

debug();
