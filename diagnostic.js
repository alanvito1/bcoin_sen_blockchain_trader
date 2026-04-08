const path = require('path');
const fs = require('fs');

console.log('--- ROOT DIAGNOSTIC START ---');
try {
  const modules = [
    'telegraf',
    './src/config/prisma',
    './src/bot/middleware/telemetry',
    './src/bot/middleware/rateLimit',
    './src/bot/sessionStore',
    './src/bot/commands/start',
    './src/bot/features/wallet',
    './src/bot/features/tradePanel',
    './src/bot/features/store',
    './src/bot/features/tokenManager',
    './src/bot/features/status',
    './src/bot/commands/admin',
    './src/bot/features/support',
    './src/bot/features/tools',
    './src/bot/features/referral'
  ];

  for (const mod of modules) {
    try {
      console.log(`Auditing module: ${mod}...`);
      require(mod);
      console.log(`✅ ${mod} OK`);
    } catch (modErr) {
      console.error(`❌ FAILED to load ${mod}: ${modErr.message}`);
      // Log full stack trace
      console.error(modErr.stack);
      throw modErr;
    }
  }

  console.log('Final check: Attempting to require ./src/bot/index...');
  const bot = require('./src/bot/index');
  console.log('✅ Success! Full bot loaded.');
} catch (e) {
  console.error('\n--- FATAL ERROR ---');
  console.error('Message:', e.message);
  console.error('Stack:', e.stack);
  console.error('-------------------\n');
  process.exit(1);
}
console.log('--- ROOT DIAGNOSTIC END ---');
