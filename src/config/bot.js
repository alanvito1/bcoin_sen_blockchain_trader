const { Telegraf } = require('telegraf');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error('❌ [CRITICAL] TELEGRAM_BOT_TOKEN is missing in environment!');
    // Don't process.exit(1) here as it might be required by workers that don't need the bot immediately
}

/**
 * Singleton Telegraf instance to be shared across the application.
 * This ensures that workers and handlers use the same connection/context.
 */
const bot = new Telegraf(token);

module.exports = bot;
