const path = require('path');
const fs = require('fs');

console.log('--- DIAGNOSTIC START ---');
try {
  const modules = [
    'telegraf',
    '../config/prisma',
    './middleware/telemetry',
    './middleware/rateLimit',
    './sessionStore',
    './commands/start',
    './features/wallet',
    './features/tradePanel',
    './features/store',
    './features/tokenManager',
    './features/status',
    './commands/admin',
    './features/support',
    './features/tools',
    './features/referral'
  ];

  for (const mod of modules) {
    try {
      console.log(`Auditing module: ${mod}...`);
      require(mod);
      console.log(`✅ ${mod} OK`);
    } catch (modErr) {
      console.error(`❌ FAILED to load ${mod}: ${modErr.message}`);
      throw modErr;
    }
  }

  console.log('Final check: Attempting to require ./bot/index...');
  const bot = require('./bot/index');
  console.log('✅ Success! Full bot loaded.');
} catch (e) {
  console.error('\n--- FATAL ERROR ---');
  console.error('Message:', e.message);
  console.error('Stack:', e.stack);
  console.error('-------------------\n');
  process.exit(1);
}
console.log('--- DIAGNOSTIC END ---');
