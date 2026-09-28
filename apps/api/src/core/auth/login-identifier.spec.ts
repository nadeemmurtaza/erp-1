import { createHash } from 'node:crypto';
import { hashLoginIdentifier, loginIdentifierHash, normalizeLoginIdentifier } from './login-identifier';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('login identifiers as the rate limiter and the audit trail see them (doc 206 §1.2)', () => {
  it.each([
    ['an email, however it was typed', '  Ayesha@Example.COM ', 'ayesha@example.com'],
    ['a local phone number', '0300 1234567', '+923001234567'],
    ['the same number in international form', '+92 300 1234567', '+923001234567'],
    ['something that is neither — still counted, never skipped', '  Not-An-Identifier ', 'not-an-identifier'],
  ])('normalises %s', (_case, typed, normalized) => {
    expect(normalizeLoginIdentifier(typed)).toBe(normalized);
  });

  it('every spelling of one identifier shares one bucket', () => {
    const spellings = ['0300 1234567', '03001234567', '+923001234567', '0092 300 1234567'];
    const hashes = new Set(spellings.map((typed) => loginIdentifierHash(typed)));
    expect(hashes.size).toBe(1);
  });

  it('is sha256 of the normalised identifier, hex — the plaintext never leaves this function', () => {
    expect(hashLoginIdentifier('ayesha@example.com')).toBe(sha256('ayesha@example.com'));
    expect(loginIdentifierHash('Ayesha@Example.com')).toBe(sha256('ayesha@example.com'));
    expect(loginIdentifierHash('Ayesha@Example.com')).not.toContain('ayesha');
  });

  it('an email and a phone number are separate buckets, even for one account — keying by account would leak which number belongs to which email', () => {
    expect(loginIdentifierHash('ayesha@example.com')).not.toBe(loginIdentifierHash('0300 1234567'));
  });

  it.each([[undefined], [null], [42], [''], ['   '], [{ identifier: 'x' }]])(
    'has no hash for an unvalidated body value that is not a non-empty string (%p)',
    (value) => {
      expect(loginIdentifierHash(value)).toBeNull();
    },
  );
});
