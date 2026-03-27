require('dotenv').config();
const { performAllTrades } = require('../src/services/scheduler');
const config = require('../src/config');

// Ensure DRY_RUN is what's in .env (usually false for live)
console.log(`--- STARTING LIVE CYCLE VERIFICATION (DRY_RUN: ${config.strategy.dryRun}) ---`);

performAllTrades().then(() => {
  console.log('--- LIVE CYCLE COMPLETE ---');
  process.exit(0);
}).catch(err => {
  console.error('Live cycle failed:', err);
  process.exit(1);
});
