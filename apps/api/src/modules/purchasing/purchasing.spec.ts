import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { LotsService } from '../inventory/lots.service';
import { SerializedUnitsService } from '../inventory/serialized-units.service';
import { PartiesService } from '../parties/parties.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { BranchPolicyRegistry } from '../../core/extension-points/branch-policy.registry';

describe('PurchasingService', () => {
  let service: PurchasingService;
  let prisma: any;
  let branchPolicy: { allowsBranchLocalPurchasing: jest.Mock };

  beforeEach(async () => {
    // Every constructor dependency is stubbed. When a new one is injected this
    // suite fails to compile the module, which is the point — it is the cheap
    // guard that caught the receipt service growing two dependencies silently.
    prisma = { $transaction: jest.fn() };
    branchPolicy = { allowsBranchLocalPurchasing: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasingService,
        { provide: PrismaService, useValue: prisma },
        { provide: InventoryService, useValue: {} },
        { provide: LotsService, useValue: {} },
        { provide: SerializedUnitsService, useValue: {} },
        { provide: PartiesService, useValue: {} },
        { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        { provide: EventBusService, useValue: {} },
        { provide: BranchPolicyRegistry, useValue: branchPolicy },
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

    it('never asks BranchPolicyRegistry for a non-BRANCH scope', async () => {
      await service.createPurchaseOrder({ supplierId: 'sup1', items: [], scopeLevel: 'BRAND' } as any, 'user1');

      expect(branchPolicy.allowsBranchLocalPurchasing).not.toHaveBeenCalled();
      expect(tx.purchaseOrder.create).toHaveBeenCalled();
    });

    it('creates a BRANCH-scope PO when BranchPolicyRegistry allows it', async () => {
      branchPolicy.allowsBranchLocalPurchasing.mockResolvedValue(true);

      await service.createPurchaseOrder({ supplierId: 'sup1', items: [], scopeLevel: 'BRANCH' } as any, 'user1');

      expect(branchPolicy.allowsBranchLocalPurchasing).toHaveBeenCalledWith('user1');
      expect(tx.purchaseOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ scopeLevel: 'BRANCH' }) }),
      );
    });

    it('refuses a BRANCH-scope PO when BranchPolicyRegistry denies it — WO-23.3b, R9', async () => {
      branchPolicy.allowsBranchLocalPurchasing.mockResolvedValue(false);

      await expect(
        service.createPurchaseOrder({ supplierId: 'sup1', items: [], scopeLevel: 'BRANCH' } as any, 'user1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.purchaseOrder.create).not.toHaveBeenCalled();
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
          { provide: LotsService, useValue: {} },
          { provide: SerializedUnitsService, useValue: {} },
          { provide: PartiesService, useValue: createParties },
          { provide: SettingsService, useValue: {} },
          { provide: AppConfigService, useValue: {} },
          { provide: EventBusService, useValue: {} },
          { provide: BranchPolicyRegistry, useValue: { allowsBranchLocalPurchasing: jest.fn().mockResolvedValue(true) } },
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

  describe('receiveGoods — lots (doc 32) and serialized units (doc 158)', () => {
    let receiveService: PurchasingService;
    let receiveTx: any;
    let inventoryMock: any;
    let lotsMock: any;
    let serializedUnitsMock: any;
    let eventsMock: any;

    function basePo() {
      return {
        id: 'po1',
        supplierId: 'sup1',
        status: 'SENT',
        scopeLevel: 'BRAND',
        originNodeId: 'main',
        items: [{ id: 'poi1', variantId: 'v1', quantityOrdered: 10, quantityReceived: 0, unitCost: 100 }],
      };
    }

    beforeEach(async () => {
      receiveTx = {
        $executeRaw: jest.fn(),
        $queryRaw: jest.fn().mockResolvedValue([{ max: null }]),
        purchaseOrder: { findUnique: jest.fn().mockResolvedValue(basePo()), update: jest.fn() },
        goodsReceipt: { create: jest.fn().mockResolvedValue({ id: 'gr1', number: 'GRN-2026-0001', receivedAt: new Date('2026-01-01') }) },
        productVariant: {
          findMany: jest.fn().mockResolvedValue([{ id: 'v1', stock: 5, costPrice: 100, lotTracked: false, tracksSerials: false }]),
          update: jest.fn(),
        },
        purchaseOrderItem: {
          update: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ quantityReceived: 10, quantityOrdered: 10 }]),
        },
      };
      inventoryMock = { defaultLocationId: jest.fn().mockResolvedValue('loc1'), moveMany: jest.fn().mockResolvedValue([]) };
      lotsMock = { recordReceipt: jest.fn().mockResolvedValue({ id: 'lot1' }) };
      serializedUnitsMock = { receiveUnits: jest.fn().mockResolvedValue([]) };
      eventsMock = { publish: jest.fn() };

      const receivePrisma = { $transaction: jest.fn((fn: any) => fn(receiveTx)) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PurchasingService,
          { provide: PrismaService, useValue: receivePrisma },
          { provide: InventoryService, useValue: inventoryMock },
          { provide: LotsService, useValue: lotsMock },
          { provide: SerializedUnitsService, useValue: serializedUnitsMock },
          { provide: PartiesService, useValue: {} },
          { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
          { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
          { provide: EventBusService, useValue: eventsMock },
          { provide: BranchPolicyRegistry, useValue: {} },
        ],
      }).compile();

      receiveService = module.get(PurchasingService);
    });

    it('an ordinary (non-lot, non-serial) line behaves exactly as before — one batched moveMany(), no LotsService/SerializedUnitsService call', async () => {
      await receiveService.receiveGoods('po1', { items: [{ purchaseOrderItemId: 'poi1', quantity: 10 }] } as any, 'user1');

      expect(inventoryMock.moveMany).toHaveBeenCalledTimes(1);
      expect(lotsMock.recordReceipt).not.toHaveBeenCalled();
      expect(serializedUnitsMock.receiveUnits).not.toHaveBeenCalled();
    });

    it('a lot-tracked line registers the Lot alongside the ordinary batched movement', async () => {
      receiveTx.productVariant.findMany.mockResolvedValue([{ id: 'v1', stock: 5, costPrice: 100, lotTracked: true, tracksSerials: false }]);

      await receiveService.receiveGoods(
        'po1',
        { items: [{ purchaseOrderItemId: 'poi1', quantity: 10, lotCode: 'L001', expiresOn: '2027-01-01' }] } as any,
        'user1',
      );

      expect(inventoryMock.moveMany).toHaveBeenCalledTimes(1);
      expect(lotsMock.recordReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v1', locationId: 'loc1', lotCode: 'L001', quantity: 10, sourceReceiptId: 'gr1' }),
        receiveTx,
      );
    });

    it('a serialized line creates one unit per serial via SerializedUnitsService, never through the batched moveMany()', async () => {
      receiveTx.productVariant.findMany.mockResolvedValue([{ id: 'v1', stock: 5, costPrice: 100, lotTracked: false, tracksSerials: true }]);

      await receiveService.receiveGoods(
        'po1',
        { items: [{ purchaseOrderItemId: 'poi1', quantity: 2, serials: ['IMEI1', 'IMEI2'] }] } as any,
        'user1',
      );

      expect(inventoryMock.moveMany).not.toHaveBeenCalled();
      expect(serializedUnitsMock.receiveUnits).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v1', locationId: 'loc1', serials: ['IMEI1', 'IMEI2'], lotId: null }),
        receiveTx,
      );
    });

    it('refuses the whole receipt when a serialized line\'s serial count does not match its quantity', async () => {
      receiveTx.productVariant.findMany.mockResolvedValue([{ id: 'v1', stock: 5, costPrice: 100, lotTracked: false, tracksSerials: true }]);

      await expect(
        receiveService.receiveGoods(
          'po1',
          { items: [{ purchaseOrderItemId: 'poi1', quantity: 3, serials: ['IMEI1', 'IMEI2'] }] } as any,
          'user1',
        ),
      ).rejects.toThrow(/serial numbers given/);
      expect(serializedUnitsMock.receiveUnits).not.toHaveBeenCalled();
    });

    it('a lot-tracked AND serialized line registers the Lot first, then attaches every unit to it', async () => {
      receiveTx.productVariant.findMany.mockResolvedValue([{ id: 'v1', stock: 5, costPrice: 100, lotTracked: true, tracksSerials: true }]);
      lotsMock.recordReceipt.mockResolvedValue({ id: 'lot42' });

      await receiveService.receiveGoods(
        'po1',
        { items: [{ purchaseOrderItemId: 'poi1', quantity: 1, lotCode: 'L042', serials: ['IMEI9'] }] } as any,
        'user1',
      );

      expect(lotsMock.recordReceipt).toHaveBeenCalledTimes(1);
      expect(serializedUnitsMock.receiveUnits).toHaveBeenCalledWith(
        expect.objectContaining({ lotId: 'lot42', serials: ['IMEI9'] }),
        receiveTx,
      );
    });
  });
});
