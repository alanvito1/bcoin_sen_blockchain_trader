const path = require('path');
const fs = require('fs');

console.log('--- DIAGNOSTIC START ---');
try {
  console.log('Attempting to require ./src/bot/index...');
  const bot = require('./src/bot/index');
  console.log('✅ Success! Bot loaded.');
} catch (e) {
  console.error('❌ FAILED to load bot.');
  console.error('Error Name:', e.name);
  console.error('Error Message:', e.message);
  if (e.code) console.error('Error Code:', e.code);
  console.error('Stack Trace:', e.stack);
  
  fs.writeFileSync('diagnostic_error.log', JSON.stringify({
    name: e.name,
    message: e.message,
    code: e.code,
    stack: e.stack
  }, null, 2));
  console.log('Detailed error saved to diagnostic_error.log');
}
console.log('--- DIAGNOSTIC END ---');
