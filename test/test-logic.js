const { performAllTrades } = require('../src/services/scheduler');
const config = require('../src/config');

// Ensure DRY_RUN is on
config.strategy.dryRun = true;

console.log('--- STARTING LOGIC VERIFICATION ---');
performAllTrades().then(() => {
  console.log('--- VERIFICATION COMPLETE ---');
  process.exit(0);
}).catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
