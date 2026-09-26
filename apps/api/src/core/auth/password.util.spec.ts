import {
  BcryptPasswordHasher,
  PASSWORD_HASHERS,
  PASSWORD_HASH_ROUNDS,
  hashPassword,
  verifyPassword,
} from './password.util';

/**
 * WO-126.1 (126-pluggable-cryptography.md): bcryptjs behind a
 * `PasswordHasher` interface, with no behaviour change for any stored hash.
 */
describe('password hashing (126-pluggable-cryptography.md, WO-126.1)', () => {
  let freshHash: string;

  beforeAll(async () => {
    freshHash = await hashPassword('correct horse battery staple');
  });

  it('round-trips: a hash verifies against its own plaintext and nothing else', async () => {
    await expect(verifyPassword('correct horse battery staple', freshHash)).resolves.toBe(true);
    await expect(verifyPassword('Correct horse battery staple', freshHash)).resolves.toBe(false);
    await expect(verifyPassword('', freshHash)).resolves.toBe(false);
  });

  it('writes new hashes with the default hasher at the unchanged round count', () => {
    expect(freshHash.startsWith(`$2b$${PASSWORD_HASH_ROUNDS}$`)).toBe(true);
    expect(PASSWORD_HASHERS[0].recognizes(freshHash)).toBe(true);
    expect(PASSWORD_HASHERS[0].version).toBe('bcrypt-v1');
  });

  it('still verifies a hash written before the interface existed — no forced reset', async () => {
    // Produced by bcryptjs directly (cost 4), the way every stored hash
    // before WO-126.1 was.
    const stored = '$2b$04$yX6CoP3sstI3HbTfmPkxQOT7iDHGB3y1lSWq6An4.iXYy1ZMzLr6O';

    await expect(verifyPassword('legacy-password', stored)).resolves.toBe(true);
    await expect(verifyPassword('legacy-password!', stored)).resolves.toBe(false);
    // $2a$/$2y$ are the same algorithm under older prefixes.
    await expect(verifyPassword('legacy-password', stored.replace('$2b$', '$2a$'))).resolves.toBe(true);
    await expect(verifyPassword('legacy-password', stored.replace('$2b$', '$2y$'))).resolves.toBe(true);
  });

  it("compares against auth.service.ts's dummy hash without throwing, and never matches", async () => {
    const dummy = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7pWvA5x0qXk2yBqk3aKQqQZ3bqQeGZi';
    await expect(verifyPassword('anything at all', dummy)).resolves.toBe(false);
  });

  it.each([
    ['a plain string', 'not-a-real-hash'],
    ['an empty string', ''],
    ['another algorithm no hasher is registered for', '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA'],
    // bcryptjs itself throws "Invalid salt version" on this shape.
    ['a 60-character value that is not bcrypt', 'y'.repeat(60)],
  ])('fails %s cleanly — false, never a throw and never a match', async (_label, stored) => {
    await expect(verifyPassword('not-a-real-hash', stored)).resolves.toBe(false);
  });

  it('routes an unrecognized hash through the default hasher’s real comparison', async () => {
    const spy = jest.spyOn(PASSWORD_HASHERS[0], 'verify');
    try {
      await verifyPassword('pw', 'not-a-real-hash');
      expect(spy).toHaveBeenCalledWith('pw', 'not-a-real-hash');
    } finally {
      spy.mockRestore();
    }
  });

  it('only claims hashes in its own format', () => {
    const bcrypt = new BcryptPasswordHasher();
    expect(bcrypt.recognizes(freshHash)).toBe(true);
    expect(bcrypt.recognizes('$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA')).toBe(false);
    expect(bcrypt.recognizes('not-a-real-hash')).toBe(false);
  });

  it('cannot be given another hasher at runtime', () => {
    expect(Object.isFrozen(PASSWORD_HASHERS)).toBe(true);
  });
});
