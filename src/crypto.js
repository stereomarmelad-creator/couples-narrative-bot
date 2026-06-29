var crypto = require('crypto');

var PBKDF2_ITERATIONS = 100000;
var KEY_LENGTH = 32; // 256 bits
var SALT_LENGTH = 16;
var IV_LENGTH = 16;
var TAG_LENGTH = 16;
var DIGEST = 'sha256';

function deriveKey(telegramId) {
  var salt = crypto.createHash('sha256')
    .update(String(telegramId))
    .digest()
    .slice(0, SALT_LENGTH);
  var secret = process.env.ENCRYPTION_SECRET || 'default-dev-secret-change-me';
  return crypto.pbkdf2Sync(
    secret + String(telegramId),
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    DIGEST
  );
}

function encrypt(plaintext, telegramId) {
  if (!plaintext) return '';
  var key = deriveKey(telegramId);
  var iv = crypto.randomBytes(IV_LENGTH);
  var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  var encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  var tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all base64)
  return iv.toString('base64') + ':' + tag.toString('base64') + ':' + encrypted;
}

function decrypt(ciphertext, telegramId) {
  if (!ciphertext) return '';
  var parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  var iv = Buffer.from(parts[0], 'base64');
  var tag = Buffer.from(parts[1], 'base64');
  var encrypted = parts[2];
  var key = deriveKey(telegramId);
  var decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  var decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  encrypt: encrypt,
  decrypt: decrypt,
  deriveKey: deriveKey
};
