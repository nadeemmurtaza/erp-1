import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductReferencesController } from './product-references.controller';

describe('ProductReferencesController — 166-unified-product-reference-registry.md WO-166.3', () => {
  let marketplace: any;
  let sync: any;
  let prisma: any;
  let controller: ProductReferencesController;

  beforeEach(() => {
    marketplace = {
      lookupProductReference: jest.fn(),
      registerProductReference: jest.fn(),
      linkProductReference: jest.fn(),
    };
    sync = { adopt: jest.fn() };
    prisma = { productVariant: { findUnique: jest.fn() } };
    controller = new ProductReferencesController(marketplace, sync, prisma);
  });

  describe('lookup', () => {
    it('returns the reference on a match', async () => {
      marketplace.lookupProductReference.mockResolvedValue({ id: 'ref1', barcode: '01234567890123' });
      const result = await controller.lookup({ barcode: '01234567890123' });
      expect(result).toEqual({ id: 'ref1', barcode: '01234567890123' });
    });

    it('404s when the platform has no match — the form falls back to a blank field', async () => {
      marketplace.lookupProductReference.mockResolvedValue(null);
      await expect(controller.lookup({ barcode: '01234567890123' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('apply', () => {
    it('re-fetches the reference by the variant\'s own barcode rather than trusting a client-supplied payload', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', productId: 'p1', barcode: '01234567890123' });
      marketplace.lookupProductReference.mockResolvedValue({ id: 'ref1', barcode: '01234567890123', updatedAt: '2026-09-26T00:00:00Z' });

      const result = await controller.apply({ variantId: 'v1' });

      expect(marketplace.lookupProductReference).toHaveBeenCalledWith('01234567890123');
      expect(sync.adopt).toHaveBeenCalledWith(
        expect.objectContaining({ productId: 'p1', referenceId: 'ref1' }),
      );
      expect(marketplace.linkProductReference).toHaveBeenCalledWith('ref1', 'v1');
      expect(result).toEqual({ referenceId: 'ref1' });
    });

    it('404s a variant whose barcode no longer matches anything (e.g. the reference was deleted)', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', productId: 'p1', barcode: '01234567890123' });
      marketplace.lookupProductReference.mockResolvedValue(null);

      await expect(controller.apply({ variantId: 'v1' })).rejects.toBeInstanceOf(NotFoundException);
      expect(sync.adopt).not.toHaveBeenCalled();
    });

    it('refuses a variant with no barcode', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', barcode: null });
      await expect(controller.apply({ variantId: 'v1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never fails the request when linking fails — the local adoption already succeeded', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', productId: 'p1', barcode: '01234567890123' });
      marketplace.lookupProductReference.mockResolvedValue({ id: 'ref1', barcode: '01234567890123', updatedAt: '2026-09-26T00:00:00Z' });
      marketplace.linkProductReference.mockRejectedValue(new Error('platform unreachable'));

      const result = await controller.apply({ variantId: 'v1' });

      expect(result).toEqual({ referenceId: 'ref1' });
    });
  });

  describe('register', () => {
    it('derives translations and images from the just-saved product and registers them', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'p1',
        barcode: '01234567890123',
        product: {
          slug: 'lawn-suit',
          fabric: 'lawn',
          season: 'summer',
          translations: [{ locale: 'en', name: 'Lawn suit', description: 'A suit', careInstructions: null }],
          images: [{ url: 'https://cdn.example/a.jpg', alt: null, variantId: null, order: 0, translations: [] }],
        },
      });
      marketplace.registerProductReference.mockResolvedValue({ id: 'ref1', barcode: '01234567890123', updatedAt: '2026-09-26T00:00:00Z' });

      const result = await controller.register({ variantId: 'v1' });

      expect(marketplace.registerProductReference).toHaveBeenCalledWith(
        expect.objectContaining({
          barcode: '01234567890123',
          translations: [{ locale: 'en', name: 'Lawn suit', description: 'A suit', careInstructions: null }],
          images: [{ url: 'https://cdn.example/a.jpg', altText: 'Lawn suit', order: 0 }],
          attributes: { fabric: 'lawn', season: 'summer' },
        }),
      );
      expect(sync.adopt).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', referenceId: 'ref1' }));
      expect(result).toEqual({ referenceId: 'ref1' });
    });

    it('excludes another variant\'s own images', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'p1',
        barcode: '01234567890123',
        product: {
          slug: 'lawn-suit',
          translations: [{ locale: 'en', name: 'Lawn suit', description: null, careInstructions: null }],
          images: [
            { url: 'https://cdn.example/mine.jpg', alt: null, variantId: 'v1', order: 0, translations: [] },
            { url: 'https://cdn.example/other.jpg', alt: null, variantId: 'v2', order: 0, translations: [] },
          ],
        },
      });
      marketplace.registerProductReference.mockResolvedValue({ id: 'ref1', barcode: '01234567890123', updatedAt: '2026-09-26T00:00:00Z' });

      await controller.register({ variantId: 'v1' });

      const call = marketplace.registerProductReference.mock.calls[0][0];
      expect(call.images).toEqual([{ url: 'https://cdn.example/mine.jpg', altText: 'Lawn suit', order: 0 }]);
    });

    it('refuses a variant with no barcode', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', barcode: null, product: { translations: [], images: [] } });
      await expect(controller.register({ variantId: 'v1' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
