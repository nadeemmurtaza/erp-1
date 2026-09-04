import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encrypts a third-party secret (an SMTP/IMAP password today) for storage in
 * the database.
 *
 * AES-256-GCM: authenticated encryption, so a tampered ciphertext fails to
 * decrypt rather than silently returning garbage that gets handed to a mail
 * server as a password. The key comes from APP_ENCRYPTION_KEY — never
 * derived from a JWT secret, so rotating one never silently breaks the
 * other. A fresh random IV per call means encrypting the same password
 * twice never produces the same ciphertext, so two accounts sharing a
 * password don't leak that fact from the stored bytes.
 *
 * Output is `iv:authTag:ciphertext`, each base64url — one string, safe to
 * store in a single text column.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function loadKey(rawKey: string): Buffer {
  const key = Buffer.from(rawKey, 'utf8');
  if (key.length !== 32) {
    throw new Error(
      `APP_ENCRYPTION_KEY must be exactly 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 24 | head -c 32`,
    );
  }
  return key;
}

export function encryptSecret(plaintext: string, rawKey: string): string {
  const key = loadKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64url')).join(':');
}

export function decryptSecret(stored: string, rawKey: string): string {
  const key = loadKey(rawKey);
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Stored secret is not in the expected iv:authTag:ciphertext form.');
  }
  const [ivPart, authTagPart, ciphertextPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(authTagPart, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart, 'base64url');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
