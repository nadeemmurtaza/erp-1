import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Encrypts a third-party secret (an SMTP/IMAP password, a tenant database
 * connection string) for storage in a database.
 *
 * Lives in `@newax/shared` per House Rule 11 ("if a rule needs to be
 * enforced in two places, it moves here") — the API's own credential
 * storage (`tradingpartners`, `email-accounts`) and the platform control
 * plane's tenant-deployment credentials (`39-shared-cross-tenant-hosting-tier.md`)
 * both need the identical algorithm, and a second, independently
 * maintained AES-GCM implementation is exactly the kind of drift a
 * security-critical primitive must never have.
 *
 * AES-256-GCM: authenticated encryption, so a tampered ciphertext fails to
 * decrypt rather than silently returning garbage that gets handed to a mail
 * server (or a database driver) as a credential. The key comes from each
 * caller's own encryption-key env var — never derived from a JWT secret, so
 * rotating one never silently breaks the other. A fresh random IV per call
 * means encrypting the same secret twice never produces the same
 * ciphertext, so two rows sharing a secret don't leak that fact from the
 * stored bytes.
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
      `Encryption key must be exactly 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 24 | head -c 32`,
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
