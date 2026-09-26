import { generateMarketplaceApiKey, hashMarketplaceApiKey } from './product-reference-key';

describe('product-reference-key', () => {
  it('generates a high-entropy hex key distinct from every other call', () => {
    const a = generateMarketplaceApiKey();
    const b = generateMarketplaceApiKey();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes deterministically for the same key and pepper', () => {
    const key = generateMarketplaceApiKey();
    expect(hashMarketplaceApiKey(key, 'pepper-a')).toEqual(hashMarketplaceApiKey(key, 'pepper-a'));
  });

  it('produces a different hash for a different pepper — a leaked hash from one deployment never matches another', () => {
    const key = generateMarketplaceApiKey();
    expect(hashMarketplaceApiKey(key, 'pepper-a')).not.toEqual(hashMarketplaceApiKey(key, 'pepper-b'));
  });

  it('produces a different hash for a different key under the same pepper', () => {
    expect(hashMarketplaceApiKey(generateMarketplaceApiKey(), 'pepper-a')).not.toEqual(
      hashMarketplaceApiKey(generateMarketplaceApiKey(), 'pepper-a'),
    );
  });
});
