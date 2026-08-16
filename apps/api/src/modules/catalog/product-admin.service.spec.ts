import { BadRequestException } from '@nestjs/common';
import { assertKindRules } from './product-admin.service';

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
