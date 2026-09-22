import { Test, TestingModule } from '@nestjs/testing';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { PartiesService } from '../parties/parties.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AppConfigService } from '../../core/config/app-config.service';

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
        { provide: PartiesService, useValue: {} },
        { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
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

  describe('createPurchaseOrder — WO-23.3a, RETAIL-ERP.md R13, ADR-021', () => {
    function stubTx() {
      return {
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ max: null }]),
        purchaseOrder: { create: jest.fn().mockResolvedValue({ id: 'po1' }) },
      };
    }

    let tx: ReturnType<typeof stubTx>;
    beforeEach(() => {
      tx = stubTx();
      prisma.$transaction.mockImplementation((fn: any) => fn(tx));
    });

    it('defaults scopeLevel to BRAND and stamps originNodeId from AppConfigService.nodeId when the caller names no scope', async () => {
      await service.createPurchaseOrder({ supplierId: 'sup1', items: [] } as any, 'user1');

      expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scopeLevel: 'BRAND', originNodeId: 'main' }),
        }),
      );
    });

    it('honours an explicit scopeLevel', async () => {
      await service.createPurchaseOrder({ supplierId: 'sup1', items: [], scopeLevel: 'ORG' } as any, 'user1');

      expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ scopeLevel: 'ORG', originNodeId: 'main' }) }),
      );
    });
  });

  describe('create (Supplier + its backing Party)', () => {
    let createService: PurchasingService;
    let createPrisma: any;
    let createParties: any;
    let createTx: any;

    beforeEach(async () => {
      createTx = { supplier: { create: jest.fn() } };
      createParties = { findOrCreateForRole: jest.fn() };
      createPrisma = { $transaction: jest.fn((fn: any) => fn(createTx)) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PurchasingService,
          { provide: PrismaService, useValue: createPrisma },
          { provide: InventoryService, useValue: {} },
          { provide: PartiesService, useValue: createParties },
          { provide: SettingsService, useValue: {} },
          { provide: AppConfigService, useValue: {} },
          { provide: EventBusService, useValue: {} },
        ],
      }).compile();

      createService = module.get(PurchasingService);
    });

    it('creates the Party (or links an existing match) before creating the Supplier', async () => {
      createParties.findOrCreateForRole.mockResolvedValue({ id: 'party1' });
      createTx.supplier.create.mockResolvedValue({ id: 'sup1', partyId: 'party1' });

      const dto = { name: 'Acme Textiles', phone: '0300', email: null, address: null, city: null, contactName: null } as any;
      const result = await createService.create(dto);

      expect(createParties.findOrCreateForRole).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme Textiles', phone: '0300' }),
        'SUPPLIER',
        createTx,
      );
      expect(createTx.supplier.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ...dto, partyId: 'party1' }),
      });
      expect(result).toEqual({ id: 'sup1', partyId: 'party1' });
    });
  });
});
