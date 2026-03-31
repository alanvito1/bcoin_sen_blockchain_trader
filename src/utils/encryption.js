const crypto = require('crypto');
require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; 
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a string using AES-256-GCM
 * @param {string} text 
 * @returns {object} { encryptedData: string, iv: string, authTag: string }
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is missing in env');
  }

  // ENCRYPTION_KEY must be 32 bytes (64 hex chars)
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }

  // IV must be 16 bytes for AES-256-GCM as per briefing requirement 2.1
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag
  };
}

/**
 * Decrypts a string using AES-256-GCM
 * @param {object} encryptedObj { encryptedData, iv, authTag }
 * @returns {string}
 */
function decrypt({ encryptedData, iv, authTag }) {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is missing in env');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv(
    ALGORITHM, 
    key, 
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};
