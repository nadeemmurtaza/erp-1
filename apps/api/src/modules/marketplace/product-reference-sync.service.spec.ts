import { ProductReferenceSyncService } from './product-reference-sync.service';

/**
 * 166-unified-product-reference-registry.md WO-166.4 — the two write paths
 * ("Fill from shared listing?" accepted, and a later push delivery) and the
 * "never silently clobbered" guarantee both are built around.
 */
describe('ProductReferenceSyncService', () => {
  let prisma: any;
  let tx: any;
  let service: ProductReferenceSyncService;

  beforeEach(() => {
    tx = {
      productTranslation: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), upsert: jest.fn() },
      productImage: { deleteMany: jest.fn(), create: jest.fn() },
      productImageTranslation: { create: jest.fn() },
    };
    prisma = {
      productVariant: { findUnique: jest.fn() },
      $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)),
    };
    service = new ProductReferenceSyncService(prisma);
  });

  describe('adopt', () => {
    it('stamps provenance on an existing translation without touching its name/description/careInstructions', async () => {
      tx.productTranslation.findUnique.mockResolvedValue({ id: 't1', name: 'Staff-edited name' });

      await service.adopt({
        productId: 'p1',
        referenceId: 'ref1',
        referenceUpdatedAt: new Date('2026-09-26T00:00:00Z'),
        payload: { barcode: '01234567890123', translations: [{ locale: 'en', name: 'Registry name' }] },
      });

      expect(tx.productTranslation.update).toHaveBeenCalledWith({
        where: { productId_locale: { productId: 'p1', locale: 'en' } },
        data: { sourcedFromGlobalReferenceId: 'ref1', sourcedFromReferenceUpdatedAt: new Date('2026-09-26T00:00:00Z') },
      });
      expect(tx.productTranslation.create).not.toHaveBeenCalled();
    });

    it('creates a locale the reference has but the product does not yet — genuinely new content', async () => {
      tx.productTranslation.findUnique.mockResolvedValue(null);

      await service.adopt({
        productId: 'p1',
        referenceId: 'ref1',
        referenceUpdatedAt: new Date('2026-09-26T00:00:00Z'),
        payload: { barcode: '01234567890123', translations: [{ locale: 'ur', name: 'اردو نام' }] },
      });

      expect(tx.productTranslation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ locale: 'ur', name: 'اردو نام', sourcedFromGlobalReferenceId: 'ref1' }),
      });
    });

    it('writes the reference images fresh, with per-locale alt text', async () => {
      tx.productTranslation.findUnique.mockResolvedValue({ id: 't1' });
      tx.productImage.create.mockResolvedValue({ id: 'img1' });

      await service.adopt({
        productId: 'p1',
        referenceId: 'ref1',
        referenceUpdatedAt: new Date(),
        payload: {
          barcode: '01234567890123',
          translations: [{ locale: 'en', name: 'x' }],
          images: [{ url: 'https://platform.example/img.jpg', altText: 'A lawn suit', order: 0 }],
        },
      });

      expect(tx.productImage.deleteMany).toHaveBeenCalledWith({ where: { productId: 'p1', sourcedFromGlobalReferenceId: 'ref1' } });
      expect(tx.productImage.create).toHaveBeenCalledWith({
        data: { productId: 'p1', url: 'https://platform.example/img.jpg', order: 0, sourcedFromGlobalReferenceId: 'ref1' },
      });
      expect(tx.productImageTranslation.create).toHaveBeenCalledWith({
        data: { imageId: 'img1', locale: 'en', alt: 'A lawn suit' },
      });
    });
  });

  describe('apply', () => {
    it('no-ops when this tenant does not stock the barcode', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(null);

      const result = await service.apply({
        referenceId: 'ref1',
        barcode: '01234567890123',
        updatedAt: '2026-09-26T00:00:00Z',
        translations: [{ locale: 'en', name: 'x' }],
      });

      expect(result).toEqual({ applied: false });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('overwrites a translation row still sourced from this exact reference', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ productId: 'p1' });
      tx.productTranslation.findUnique.mockResolvedValue({
        sourcedFromGlobalReferenceId: 'ref1',
        sourcedFromReferenceUpdatedAt: new Date('2026-09-01T00:00:00Z'),
      });

      await service.apply({
        referenceId: 'ref1',
        barcode: '01234567890123',
        updatedAt: '2026-09-26T00:00:00Z',
        translations: [{ locale: 'en', name: 'Updated name' }],
      });

      expect(tx.productTranslation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ name: 'Updated name', sourcedFromGlobalReferenceId: 'ref1' }) }),
      );
    });

    it('never clobbers a translation with no marker (a local override, or never adopted)', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ productId: 'p1' });
      tx.productTranslation.findUnique.mockResolvedValue({ sourcedFromGlobalReferenceId: null });

      await service.apply({
        referenceId: 'ref1',
        barcode: '01234567890123',
        updatedAt: '2026-09-26T00:00:00Z',
        translations: [{ locale: 'en', name: 'Would-be overwrite' }],
      });

      expect(tx.productTranslation.upsert).not.toHaveBeenCalled();
    });

    it('never clobbers a translation sourced from a different reference', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ productId: 'p1' });
      tx.productTranslation.findUnique.mockResolvedValue({ sourcedFromGlobalReferenceId: 'some-other-ref' });

      await service.apply({
        referenceId: 'ref1',
        barcode: '01234567890123',
        updatedAt: '2026-09-26T00:00:00Z',
        translations: [{ locale: 'en', name: 'x' }],
      });

      expect(tx.productTranslation.upsert).not.toHaveBeenCalled();
    });

    it('treats a redelivered (at-least-once) sync as a no-op, not a redundant rewrite', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ productId: 'p1' });
      tx.productTranslation.findUnique.mockResolvedValue({
        sourcedFromGlobalReferenceId: 'ref1',
        sourcedFromReferenceUpdatedAt: new Date('2026-09-26T00:00:00Z'),
      });

      await service.apply({
        referenceId: 'ref1',
        barcode: '01234567890123',
        updatedAt: '2026-09-26T00:00:00Z', // identical to what was already applied
        translations: [{ locale: 'en', name: 'x' }],
      });

      expect(tx.productTranslation.upsert).not.toHaveBeenCalled();
    });

    it('creates a translation for a locale this product has never had', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({ productId: 'p1' });
      tx.productTranslation.findUnique.mockResolvedValue(null);

      await service.apply({
        referenceId: 'ref1',
        barcode: '01234567890123',
        updatedAt: '2026-09-26T00:00:00Z',
        translations: [{ locale: 'en', name: 'x' }],
      });

      expect(tx.productTranslation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ productId: 'p1', sourcedFromGlobalReferenceId: 'ref1' }) }),
      );
    });
  });
});
