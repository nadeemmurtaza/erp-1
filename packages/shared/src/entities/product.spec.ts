import {
  getProductName,
  getProductDescription,
  getProductPrimaryImage,
  getVariantDisplayLabel,
  getVariantEffectivePrice,
  getVariantDisplayPrice,
  getProductDiscountPercent,
  getVariantStockStatus,
  getVariantIsInStock,
  getCategoryName,
} from './product';
import { toMinor } from '../constants';

describe('getProductName / getProductDescription', () => {
  const product = {
    basePrice: toMinor(1000),
    translations: [
      { locale: 'ur', name: 'کرتا', description: 'خوبصورت کرتا' },
      { locale: 'en', name: 'Kurta', description: 'A beautiful kurta' },
    ],
  };

  it('prefers the requested locale', () => {
    expect(getProductName(product, 'ur')).toBe('کرتا');
  });

  it('falls back to English when the requested locale is missing', () => {
    expect(getProductName(product, 'fr')).toBe('Kurta');
  });

  it('falls back to whatever translation exists when English is also missing', () => {
    expect(getProductName({ translations: [{ locale: 'ur', name: 'کرتا' }] }, 'fr')).toBe('کرتا');
  });

  it('returns null with no translations at all', () => {
    expect(getProductName({})).toBeNull();
  });

  it('reads the matching description', () => {
    expect(getProductDescription(product, 'en')).toBe('A beautiful kurta');
  });
});

describe('getProductPrimaryImage', () => {
  it('picks the flagged primary image over order', () => {
    const product = {
      basePrice: 0,
      images: [
        { url: 'a.jpg', order: 0 },
        { url: 'b.jpg', order: 1, isPrimary: true },
      ],
    };
    expect(getProductPrimaryImage(product)?.url).toBe('b.jpg');
  });

  it('falls back to the lowest order when nothing is flagged primary', () => {
    const product = {
      basePrice: 0,
      images: [
        { url: 'b.jpg', order: 1 },
        { url: 'a.jpg', order: 0 },
      ],
    };
    expect(getProductPrimaryImage(product)?.url).toBe('a.jpg');
  });

  it('returns null with no images', () => {
    expect(getProductPrimaryImage({})).toBeNull();
  });
});

describe('getVariantDisplayLabel', () => {
  it('prefers the option-model label when present', () => {
    expect(getVariantDisplayLabel({ label: 'Medium / Ferozi' })).toBe('Medium / Ferozi');
  });

  it('falls back to size/color exactly like OrderItem.variantLabel', () => {
    expect(getVariantDisplayLabel({ size: 'M', color: 'Blue' })).toBe('M / Blue');
  });

  it('handles a size-only variant', () => {
    expect(getVariantDisplayLabel({ size: 'M' })).toBe('M');
  });

  it('returns null with neither a label nor size/color', () => {
    expect(getVariantDisplayLabel({})).toBeNull();
  });
});

describe('getVariantEffectivePrice / getVariantDisplayPrice', () => {
  const product = { basePrice: toMinor(1000) };

  it('uses the product base price with no override', () => {
    const variant = {};
    expect(getVariantEffectivePrice(product, variant)).toBe(toMinor(1000));
    expect(getVariantDisplayPrice(product, variant).replace(/\s/g, ' ')).toBe('Rs 1,000');
  });

  it('uses the variant override when set', () => {
    const variant = { priceOverride: toMinor(1200) };
    expect(getVariantEffectivePrice(product, variant)).toBe(toMinor(1200));
  });
});

describe('getProductDiscountPercent', () => {
  it('computes the percentage off compareAtPrice', () => {
    expect(getProductDiscountPercent({ basePrice: toMinor(800), compareAtPrice: toMinor(1000) })).toBe(20);
  });

  it('returns null when there is no compareAtPrice', () => {
    expect(getProductDiscountPercent({ basePrice: toMinor(800) })).toBeNull();
  });

  it('returns null when compareAtPrice is not actually higher', () => {
    expect(getProductDiscountPercent({ basePrice: toMinor(800), compareAtPrice: toMinor(800) })).toBeNull();
  });
});

describe('getVariantStockStatus / getVariantIsInStock', () => {
  it('is OUT_OF_STOCK at zero', () => {
    expect(getVariantStockStatus({ stock: 0, lowStockThreshold: 3 })).toBe('OUT_OF_STOCK');
    expect(getVariantIsInStock({ stock: 0 })).toBe(false);
  });

  it('is LOW_STOCK at or below the threshold', () => {
    expect(getVariantStockStatus({ stock: 3, lowStockThreshold: 3 })).toBe('LOW_STOCK');
  });

  it('is IN_STOCK above the threshold', () => {
    expect(getVariantStockStatus({ stock: 4, lowStockThreshold: 3 })).toBe('IN_STOCK');
    expect(getVariantIsInStock({ stock: 4 })).toBe(true);
  });
});

describe('getCategoryName', () => {
  it('reads the matching locale translation', () => {
    expect(getCategoryName({ translations: [{ locale: 'en', name: 'Kurtas' }] }, 'en')).toBe('Kurtas');
  });

  it('returns null with no translations', () => {
    expect(getCategoryName({})).toBeNull();
  });
});
