import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SupplierResilienceService } from './supplier-resilience.service';
import { GoodsReceivedLeadTimeListener } from './goods-received-lead-time.listener';
import type { GoodsReceivedPayload } from '../../../core/events/domain-events';

describe('GoodsReceivedLeadTimeListener', () => {
  let listener: GoodsReceivedLeadTimeListener;
  let prisma: any;
  let resilience: any;

  beforeEach(async () => {
    prisma = { purchaseOrder: { findUnique: jest.fn() } };
    resilience = { recordObservation: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceivedLeadTimeListener,
        { provide: PrismaService, useValue: prisma },
        { provide: SupplierResilienceService, useValue: resilience },
      ],
    }).compile();
    listener = module.get(GoodsReceivedLeadTimeListener);
  });

  const PAYLOAD: GoodsReceivedPayload = {
    goodsReceiptId: 'gr1',
    number: 'GR-1',
    purchaseOrderId: 'po1',
    supplierId: 's1',
    scopeLevel: 'BRAND',
    originNodeId: null,
    receivedAtIso: '2026-01-10T00:00:00.000Z',
  };

  it('does nothing when the purchase order no longer exists', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue(null);
    await listener.onGoodsReceived(PAYLOAD);
    expect(resilience.recordObservation).not.toHaveBeenCalled();
  });

  it('records observedDays from sentAt to receivedAt when the PO was sent', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({ sentAt: new Date('2026-01-05T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') });
    await listener.onGoodsReceived(PAYLOAD);
    expect(resilience.recordObservation).toHaveBeenCalledWith('s1', 'po1', 5);
  });

  it('falls back to createdAt when the PO was never explicitly sent', async () => {
    prisma.purchaseOrder.findUnique.mockResolvedValue({ sentAt: null, createdAt: new Date('2026-01-08T00:00:00.000Z') });
    await listener.onGoodsReceived(PAYLOAD);
    expect(resilience.recordObservation).toHaveBeenCalledWith('s1', 'po1', 2);
  });
});
