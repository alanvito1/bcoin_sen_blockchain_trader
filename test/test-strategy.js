const { performAllTrades } = require('../src/services/scheduler');
const config = require('../src/config');

async function test() {
  console.log('--- STARTING DUAL STRATEGY TEST (DRY RUN) ---');
  console.log('Strategy A Enabled:', config.strategy.strategyA.enabled);
  console.log('Strategy B Enabled:', config.strategy.strategyB.enabled);
  console.log('Dry Run:', config.strategy.dryRun);
  
  try {
    await performAllTrades();
    console.log('\n--- TEST COMPLETED ---');
  } catch (error) {
    console.error('--- TEST FAILED ---');
    console.error(error);
  }
}

test();
