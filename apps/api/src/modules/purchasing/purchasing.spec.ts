import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';

describe('PurchasingService', () => {
  let service: PurchasingService;
  let prisma: any;

  beforeEach(async () => {
    // Every constructor dependency is stubbed. When a new one is injected this
    // suite fails to compile the module, which is the point — it is the cheap
    // guard that caught the receipt service growing two dependencies silently.
    prisma = { $transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: {} },
        { provide: SettingsService, useValue: {} },
        { provide: EventBusService, useValue: {} },
      ],
    }).compile();

    service = module.get<PurchasingService>(PurchasingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertReorderDraftLine', () => {
    function stubTx() {
      return {
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ max: null }]),
        purchaseOrder: {
          findFirst: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
        purchaseOrderItem: {
          update: jest.fn(),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ lineTotal: 2000 }]),
        },
      };
    }

    let tx: ReturnType<typeof stubTx>;
    beforeEach(() => {
      tx = stubTx();
      prisma.$transaction.mockImplementation((fn: any) => fn(tx));
    });

    it('creates a new DRAFT PO when none exists for the supplier', async () => {
      tx.purchaseOrder.findFirst.mockResolvedValue(null);
      tx.purchaseOrder.create.mockResolvedValue({ id: 'po1', items: [] });

      await service.upsertReorderDraftLine({
        supplierId: 'sup1',
        variantId: 'v1',
        quantity: 20,
        unitCost: 100,
      });

      expect(tx.purchaseOrder.create).toHaveBeenCalledTimes(1);
      expect(tx.purchaseOrderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ purchaseOrderId: 'po1', variantId: 'v1', quantityOrdered: 20 }),
        }),
      );
    });

    it('tops up an existing line on the open DRAFT rather than duplicating it', async () => {
      tx.purchaseOrder.findFirst.mockResolvedValue({
        id: 'po1',
        items: [{ id: 'poi1', variantId: 'v1', quantityOrdered: 10, unitCost: 100 }],
      });

      await service.upsertReorderDraftLine({
        supplierId: 'sup1',
        variantId: 'v1',
        quantity: 20,
        unitCost: 100,
      });

      expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
      expect(tx.purchaseOrderItem.create).not.toHaveBeenCalled();
      expect(tx.purchaseOrderItem.update).toHaveBeenCalledWith({
        where: { id: 'poi1' },
        data: { quantityOrdered: 20, lineTotal: 2000 },
      });
    });

    it('leaves an already-sufficient line untouched (idempotent re-run)', async () => {
      tx.purchaseOrder.findFirst.mockResolvedValue({
        id: 'po1',
        items: [{ id: 'poi1', variantId: 'v1', quantityOrdered: 20, unitCost: 100 }],
      });

      await service.upsertReorderDraftLine({
        supplierId: 'sup1',
        variantId: 'v1',
        quantity: 20,
        unitCost: 100,
      });

      expect(tx.purchaseOrderItem.update).not.toHaveBeenCalled();
      expect(tx.purchaseOrderItem.create).not.toHaveBeenCalled();
    });
  });
});
