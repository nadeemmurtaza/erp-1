import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PurchasingReorderListener } from './reorder.listener';
import { PurchasingService } from './purchasing.service';
import { SettingsService } from '../../core/settings/settings.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingKey } from '../../core/settings/settings.defaults';

describe('PurchasingReorderListener', () => {
  let listener: PurchasingReorderListener;
  let purchasing: any;
  let settings: any;
  let prisma: any;

  const basePayload = {
    productId: 'p1',
    variantId: 'v1',
    sku: 'SKU1',
    stock: 5,
    reorderPoint: 10,
    reorderQuantity: 20,
    producedInHouse: false,
    preferredSupplierId: 'sup1',
  };

  beforeEach(async () => {
    purchasing = { upsertReorderDraftLine: jest.fn() };
    settings = { get: jest.fn().mockResolvedValue(true) };
    prisma = { productVariant: { findUnique: jest.fn().mockResolvedValue({ costPrice: 500 }) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingReorderListener,
        { provide: PurchasingService, useValue: purchasing },
        { provide: SettingsService, useValue: settings },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    listener = module.get(PurchasingReorderListener);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  it('drafts a PO line for an externally sourced variant', async () => {
    await listener.onReorderPointReached(basePayload);

    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith({
      supplierId: 'sup1',
      variantId: 'v1',
      quantity: 20,
      unitCost: 500,
    });
  });

  it('ignores producedInHouse variants — production module owns those', async () => {
    await listener.onReorderPointReached({ ...basePayload, producedInHouse: true });
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
  });

  it('ignores a variant with no preferred supplier', async () => {
    await listener.onReorderPointReached({ ...basePayload, preferredSupplierId: null });
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
  });

  it('respects PurchasingAutoDraftReorder being off', async () => {
    settings.get.mockResolvedValue(false);
    await listener.onReorderPointReached(basePayload);
    expect(purchasing.upsertReorderDraftLine).not.toHaveBeenCalled();
    expect(settings.get).toHaveBeenCalledWith(SettingKey.PurchasingAutoDraftReorder);
  });

  it('falls back to (reorderPoint - stock) when reorderQuantity is unset', async () => {
    await listener.onReorderPointReached({ ...basePayload, reorderQuantity: null });
    expect(purchasing.upsertReorderDraftLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 5 }),
    );
  });
});
