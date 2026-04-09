const { session, Scenes } = require('telegraf');
const path = require('path');

console.log('--- VPS Middleware Diag ---');
console.log('CWD:', process.cwd());

try {
  const rateLimit = require('./src/bot/middleware/rateLimit');
  console.log('rateLimit type:', typeof rateLimit);
} catch (e) {
  console.log('rateLimit load error:', e.message);
}

try {
  const sessionStore = require('./src/bot/sessionStore');
  console.log('sessionStore type:', typeof sessionStore);
} catch (e) {
  console.log('sessionStore load error:', e.message);
}

console.log('Telegraf session type:', typeof session);

try {
  const s = session({ property: 'test' });
  console.log('session() return type:', typeof s);
} catch (e) {
  console.log('session() call error:', e.message);
}

try {
  const stage = new Scenes.Stage([]);
  const sm = stage.middleware();
  console.log('stage.middleware() return type:', typeof sm);
} catch (e) {
  console.log('stage.middleware() error:', e.message);
}
