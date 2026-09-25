import { generateAgencyApiKey, hashAgencyApiKey } from './agency-key';

describe('agency-key', () => {
  it('generates a high-entropy hex key distinct from every other call', () => {
    const a = generateAgencyApiKey();
    const b = generateAgencyApiKey();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes deterministically for the same key and pepper', () => {
    const key = generateAgencyApiKey();
    expect(hashAgencyApiKey(key, 'pepper-a')).toEqual(hashAgencyApiKey(key, 'pepper-a'));
  });

  it('produces a different hash for a different pepper — a leaked hash from one deployment never matches another', () => {
    const key = generateAgencyApiKey();
    expect(hashAgencyApiKey(key, 'pepper-a')).not.toEqual(hashAgencyApiKey(key, 'pepper-b'));
  });

  it('produces a different hash for a different key under the same pepper', () => {
    expect(hashAgencyApiKey(generateAgencyApiKey(), 'pepper-a')).not.toEqual(hashAgencyApiKey(generateAgencyApiKey(), 'pepper-a'));
  });
});
