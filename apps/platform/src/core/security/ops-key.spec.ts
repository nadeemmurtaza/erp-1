import { generateOpsKey, hashOpsKey } from './ops-key';

describe('ops-key', () => {
  it('generates a prefixed, high-entropy key', () => {
    const key = generateOpsKey();
    expect(key).toMatch(/^pfops_/);
    expect(key.length).toBeGreaterThan(40);
  });

  it('hashes deterministically for the same key and pepper', () => {
    const key = generateOpsKey();
    expect(hashOpsKey(key, 'pepper-a')).toBe(hashOpsKey(key, 'pepper-a'));
  });

  it('produces a different hash under a different pepper', () => {
    const key = generateOpsKey();
    expect(hashOpsKey(key, 'pepper-a')).not.toBe(hashOpsKey(key, 'pepper-b'));
  });

  it('never leaks the raw key into the hash output', () => {
    const key = generateOpsKey();
    expect(hashOpsKey(key, 'pepper')).not.toContain(key);
  });
});
