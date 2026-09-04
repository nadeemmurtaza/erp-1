import { decryptSecret, encryptSecret } from './secret-crypto';

const KEY = 'test-encryption-key-32-bytes-ok!';

describe('secret-crypto', () => {
  it('round-trips a secret', () => {
    const ciphertext = encryptSecret('super-secret-smtp-password', KEY);
    expect(ciphertext).not.toContain('super-secret-smtp-password');
    expect(decryptSecret(ciphertext, KEY)).toBe('super-secret-smtp-password');
  });

  it('produces different ciphertext for the same plaintext each time', () => {
    const a = encryptSecret('same-password', KEY);
    const b = encryptSecret('same-password', KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe('same-password');
    expect(decryptSecret(b, KEY)).toBe('same-password');
  });

  it('refuses to decrypt with the wrong key', () => {
    const ciphertext = encryptSecret('super-secret', KEY);
    expect(() => decryptSecret(ciphertext, 'a-different-32-byte-key-here!!!')).toThrow();
  });

  it('refuses a tampered ciphertext rather than returning garbage', () => {
    const ciphertext = encryptSecret('super-secret', KEY);
    const parts = ciphertext.split(':');
    const tampered = [parts[0], parts[1], parts[2]!.slice(0, -2) + 'zz'].join(':');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('rejects a key that is not exactly 32 bytes', () => {
    expect(() => encryptSecret('x', 'too-short')).toThrow(/32 bytes/);
  });
});
