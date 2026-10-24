import { BadRequestException } from '@nestjs/common';
import { assertKindRules, assertUniqueSkus } from './product-admin.service';
import type { ProductVariantDto } from './dto/product.dto';

/**
 * The rules that separate ready-made clothes, unstitched fabric and stitching
 * services. Getting these wrong is what produces a product page offering
 * "get it stitched" on a garment that is already stitched.
 */
describe('assertKindRules', () => {
  it('accepts unstitched fabric offering stitching', () => {
    expect(() =>
      assertKindRules('UNSTITCHED', { pieceCount: 3, stitchingAvailable: true }),
    ).not.toThrow();
  });

  it('accepts a stitching service that names its garment', () => {
    expect(() =>
      assertKindRules('STITCHING_SERVICE', { garmentTypeId: 'grm_1' }),
    ).not.toThrow();
  });

  it('rejects a stitching service with no garment type', () => {
    expect(() => assertKindRules('STITCHING_SERVICE', {})).toThrow(BadRequestException);
    expect(() => assertKindRules('STITCHING_SERVICE', { garmentTypeId: null })).toThrow(
      /which garment it stitches/,
    );
  });

  it('rejects stitching offered on a ready-made piece', () => {
    expect(() => assertKindRules('STITCHED', { stitchingAvailable: true })).toThrow(
      /only be offered on unstitched fabric/,
    );
  });

  it('rejects a piece count on a ready-made piece', () => {
    expect(() => assertKindRules('STITCHED', { pieceCount: 3 })).toThrow(
      /only applies to unstitched fabric/,
    );
  });

  it('rejects a piece count on a stitching service', () => {
    expect(() =>
      assertKindRules('STITCHING_SERVICE', { garmentTypeId: 'grm_1', pieceCount: 2 }),
    ).toThrow(/only applies to unstitched fabric/);
  });

  it('allows a ready-made piece with none of the unstitched fields', () => {
    expect(() => assertKindRules('STITCHED', {})).not.toThrow();
  });
});

function variant(overrides: Partial<ProductVariantDto>): ProductVariantDto {
  return { sku: 'SKU-1', ...overrides } as ProductVariantDto;
}

/**
 * The two ways a hand-typed variant list can contradict itself: the same
 * SKU twice, or the same size/colour combination twice. Neither reaches a
 * database constraint that would catch it before this runs.
 */
describe('assertUniqueSkus', () => {
  it('allows distinct SKUs with distinct size/colour combinations', () => {
    expect(() =>
      assertUniqueSkus([
        variant({ sku: 'A', size: 'S', color: 'Blue' }),
        variant({ sku: 'B', size: 'M', color: 'Blue' }),
        variant({ sku: 'C', size: 'S', color: 'Red' }),
      ]),
    ).not.toThrow();
  });

  it('rejects the same SKU twice, case- and whitespace-insensitively', () => {
    expect(() =>
      assertUniqueSkus([variant({ sku: 'abc-1' }), variant({ sku: ' ABC-1 ' })]),
    ).toThrow(/Duplicate SKU/);
  });

  it('rejects the same size/colour combination twice even with different SKUs', () => {
    expect(() =>
      assertUniqueSkus([
        variant({ sku: 'A', size: 'M', color: 'Blue' }),
        variant({ sku: 'B', size: 'm', color: ' blue ' }),
      ]),
    ).toThrow(/share the same size and colour/);
  });

  it('treats two variants with no size or colour at all as a duplicate combination', () => {
    expect(() =>
      assertUniqueSkus([variant({ sku: 'A' }), variant({ sku: 'B' })]),
    ).toThrow(/share the same size and colour/);
  });

  it('allows two variants that share only a size, or only a colour', () => {
    expect(() =>
      assertUniqueSkus([
        variant({ sku: 'A', size: 'M', color: 'Blue' }),
        variant({ sku: 'B', size: 'M', color: 'Red' }),
        variant({ sku: 'C', size: 'S', color: 'Blue' }),
      ]),
    ).not.toThrow();
  });

  it('does nothing for an empty or missing variant list', () => {
    expect(() => assertUniqueSkus([])).not.toThrow();
    expect(() => assertUniqueSkus(undefined)).not.toThrow();
  });
});
