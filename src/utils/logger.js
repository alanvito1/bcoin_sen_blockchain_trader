const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, splat, json, colorize, printf } = format;

/**
 * Redaction format to mask sensitive data like Private Keys, API Keys, and Passwords.
 */
const redact = format((info) => {
  const SENSITIVE_FIELDS = [
    'privateKey', 
    'encryptedPrivateKey', 
    'password', 
    'secret', 
    'apiKey', 
    'seed', 
    'seed_phrase',
    'mnemonic', 
    'authTag', 
    'iv',
    'jwt_token',
    'webhook_secret'
  ];
  
  const mask = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Redact specific fields
        if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
          obj[key] = '********';
        }
        
        // Redact potential hex keys/secrets in any string (including 'message')
        // Regex for 0x + 40-64 hex chars
        const hexRegex = /0x[a-fA-F0-0]{40,64}/g;
        obj[key] = obj[key].replace(hexRegex, '0x********');
        
        // Redact common secret patterns
        const secretPatterns = [
          /(privateKey|apiKey|password|secret|seed|mnemonic|token)=([^\s&,]+)/gi,
          /(auth|bearer)\s+([^\s&,]+)/gi
        ];
        
        secretPatterns.forEach(pattern => {
          obj[key] = obj[key].replace(pattern, '$1=********');
        });

      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        mask(obj[key]);
      }
    }
  };

  if (info.meta) mask(info.meta);
  mask(info);
  
  return info;
});

const logger = createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    redact(), // Apply redaction before JSON
    splat(),
    json()
  ),
  defaultMeta: { service: 'blockchain-trader' },
  transports: [
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If not in production, log to console with a simpler format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: combine(
      colorize(),
      printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length 
          ? JSON.stringify(meta, (key, value) => typeof value === 'bigint' ? value.toString() : value) 
          : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    ),
  }));
}

module.exports = logger;
