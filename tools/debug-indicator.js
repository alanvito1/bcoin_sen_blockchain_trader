const indicator = require('./src/services/indicator');

async function test() {
  try {
    console.log('Testing 30m (BSC BCOIN)...');
    const resA = await indicator.getMATrend('bsc', '0x2eebe0c34da9ba65521e98cbaa7d97496d05f489', '30', 21);
    console.log('30m result:', resA);

    console.log('\nTesting 4h (BSC BCOIN)...');
    const resB = await indicator.getMATrend('bsc', '0x2eebe0c34da9ba65521e98cbaa7d97496d05f489', '4', 21);
    console.log('4h result:', resB);
  } catch (err) {
    console.error('Test failed:', err.message);
    if (err.response) {
      console.error('Response Data:', err.response.data);
      console.error('URL:', err.config.url);
    }
  }
}

test();
