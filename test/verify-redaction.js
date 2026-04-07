const logger = require('../src/utils/logger');

logger.info('Testing redaction...', {
  privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  apiKey: 'secret-api-key-value',
  user: {
    name: 'Test',
    password: 'my-password'
  }
});

logger.error('Testing error redaction with sensitive message: privateKey=0x999999');
