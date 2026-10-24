import { checkPublishGate, type PublishGateInput } from '../src/modules/merchandising/catalog/publish-gate';

function complete(): PublishGateInput {
  return {
    translations: [
      { locale: 'en', metaTitle: 'Title', metaDescription: 'Description' },
      { locale: 'ur', metaTitle: 'عنوان', metaDescription: 'تفصیل' },
    ],
    images: [
      { isPrimary: true, altByLocale: { en: 'A blue lawn suit', ur: 'نیلا لان سوٹ' } },
    ],
    variants: [{ isActive: true, sku: 'SKU-1', price: 1000, costPrice: 500 }],
  };
}

describe('checkPublishGate', () => {
  it('passes a fully-completed product', () => {
    expect(checkPublishGate(complete())).toEqual({ passed: true, failures: [] });
  });

  it('fails with no images', () => {
    const input = { ...complete(), images: [] };
    const result = checkPublishGate(input);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('No images uploaded.');
  });

  it('fails when alt text is missing in one locale', () => {
    const input = complete();
    input.images[0]!.altByLocale.ur = null;
    const result = checkPublishGate(input);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('alt text'))).toBe(true);
  });

  it('fails with no primary image', () => {
    const input = complete();
    input.images[0]!.isPrimary = false;
    const result = checkPublishGate(input);
    expect(result.failures).toContain('No primary image is set.');
  });

  it('fails when meta title/description is missing in a locale', () => {
    const input = complete();
    input.translations[1]!.metaTitle = null;
    const result = checkPublishGate(input);
    expect(result.failures.some((f) => f.includes('UR'))).toBe(true);
  });

  it('fails with no sellable active variant', () => {
    const input = { ...complete(), variants: [{ isActive: true, sku: '', price: 0, costPrice: 500 }] };
    const result = checkPublishGate(input);
    expect(result.failures).toContain('At least one active variant needs a SKU and a price.');
  });

  it('fails when an active variant has no cost price', () => {
    const input = complete();
    input.variants[0]!.costPrice = 0;
    const result = checkPublishGate(input);
    expect(result.failures.some((f) => f.includes('cost price'))).toBe(true);
  });

  it('ignores an inactive variant with no cost price', () => {
    const input = complete();
    input.variants.push({ isActive: false, sku: 'SKU-2', price: 1000, costPrice: 0 });
    expect(checkPublishGate(input).passed).toBe(true);
  });
});
