import { MarketplaceWebhookController } from './marketplace-webhook.controller';

describe('MarketplaceWebhookController — 166-unified-product-reference-registry.md WO-166.4', () => {
  it('delegates the delivered payload straight to ProductReferenceSyncService.apply()', async () => {
    const sync = { apply: jest.fn().mockResolvedValue({ applied: true }) };
    const controller = new MarketplaceWebhookController(sync as any);

    const dto = {
      referenceId: 'ref1',
      barcode: '01234567890123',
      updatedAt: '2026-09-26T00:00:00Z',
      translations: [{ locale: 'en', name: 'Lawn suit' }],
    };
    const result = await controller.productReferenceSync(dto as any);

    expect(sync.apply).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ applied: true });
  });
});
