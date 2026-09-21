import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import { InventoryService, InsufficientStockError } from '../inventory/inventory.service';
import { TransfersService } from './transfers.service';

/**
 * TransfersService (RETAIL-ERP.md R4, WO-22.1 + WO-22.2 + WO-22.3). Real
 * Postgres, real InventoryService, one shared Nest module/Prisma connection
 * for the whole file — three separate `Test.createTestingModule()` bootstraps
 * (one per WO) each opened their own Prisma connection pool and query-engine
 * process and reliably ran this file out of heap on this machine's limited
 * RAM; nothing about the assertions below needed separate DI containers, so
 * they now share one, the same way a real app runs one module for every
 * request rather than one per feature.
 */
describe('TransfersService', () => {
  let transfers: TransfersService;
  let inventory: InventoryService;
  let prisma: PrismaService;
  /**
   * What the service published, as (name, payload) only.
   *
   * Deliberately NOT a `jest.fn()`. `EventBusService.publish` takes the
   * caller's Prisma transaction client as its third argument, and a jest mock
   * keeps every argument it was called with. A transaction client is a Proxy
   * whose every property access returns another proxy, so when an assertion on
   * such a mock FAILS, jest's pretty-printer walks it without bound and the
   * worker dies of heap exhaustion — reporting nothing at all, not even the
   * assertion that failed, which is how this file came to hang with no output.
   * Recording only what the assertions actually need means a failure here
   * fails the way a test should.
   */
  const published: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const publishedOfType = (name: string) => published.filter((e) => e.name === name);
  let events: { publish: (name: string, payload: unknown) => Promise<void> };
  let productId: string;
  let actorId: string;

  beforeAll(async () => {
    events = {
      publish: async (name: string, payload: unknown) => {
        published.push({ name, payload: payload as Record<string, unknown> });
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        TransfersService,
        InventoryService,
        PrismaService,
        SettingsService,
        StockIntakeRegistry,
        EntityEnrichmentRegistry,
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'test-node' } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: EventBusService, useValue: events },
      ],
    }).compile();

    transfers = module.get(TransfersService);
    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);

    // A product of this file's OWN, never a seeded one.
    //
    // `findFirstOrThrow()` with no `where` used to borrow whichever product
    // came first and hang this file's variants off it. Those variants are
    // visible to every suite running concurrently against the same database,
    // and cart.e2e reads that product's variants — so this file silently
    // decided which variant cart tested with. Creating and deleting its own
    // product means nothing here can be observed by anything else.
    const product = await prisma.product.create({
      data: {
        slug: `transfer-spec-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        kind: 'GOODS',
        basePrice: 0,
      },
      select: { id: true },
    });
    productId = product.id;

    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    actorId = user.id;
  });

  afterAll(async () => {
    // Every describe block's own afterAll has already removed its variants,
    // so the product is free to go.
    await prisma.product.deleteMany({ where: { id: productId } });
  });

  /**
   * dispatch/receive/cancel (WO-22.1) — real Postgres, so these assertions
   * are about the actual invariant: an in-transit Location holds exactly
   * what has left the source and not yet reached the destination, and the
   * ledger explains a short receipt rather than letting it vanish.
   */
  describe('dispatch/receive/cancel (WO-22.1)', () => {
    let sourceLocationId: string;
    let destinationLocationId: string;
    const createdVariantIds: string[] = [];
    const createdLocationIds: string[] = [];
    const createdTransferIds: string[] = [];

    beforeAll(async () => {
      const source = await prisma.location.create({ data: { name: 'WO-22.1 Source', code: `T221-SRC-${Date.now()}` } });
      const destination = await prisma.location.create({ data: { name: 'WO-22.1 Destination', code: `T221-DST-${Date.now()}` } });
      sourceLocationId = source.id;
      destinationLocationId = destination.id;
      createdLocationIds.push(source.id, destination.id);
    });

    afterAll(async () => {
      await prisma.stockTransferLine.deleteMany({ where: { transferId: { in: createdTransferIds } } });
      await prisma.stockTransfer.deleteMany({ where: { id: { in: createdTransferIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
      await prisma.location.deleteMany({ where: { id: { in: createdLocationIds } } });
    });

    async function freshVariant() {
      const variant = await prisma.productVariant.create({
        data: { productId, sku: `TRANSFER-TEST-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
      createdVariantIds.push(variant.id);
      return variant;
    }

    it('rejects a transfer with source === destination', async () => {
      await expect(
        transfers.dispatch(actorId, sourceLocationId, sourceLocationId, [{ variantId: 'x', quantity: 1 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a transfer with no lines', async () => {
      await expect(transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to dispatch more than the source actually has — move() stays guarded', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 2, reason: 'ADJUSTMENT' });

      await expect(
        transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [{ variantId: variant.id, quantity: 5 }]),
      ).rejects.toBeInstanceOf(InsufficientStockError);

      const sourceStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: sourceLocationId } },
      });
      expect(sourceStock.quantity).toBe(2); // untouched
    });

    it('dispatch creates an IN_TRANSIT location and moves stock out of source into it', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 10, reason: 'ADJUSTMENT' });

      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 4 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      expect(transfer.status).toBe('IN_TRANSIT');
      expect(transfer.number).toMatch(/^TRF-\d{4}-\d{4}$/);

      const inTransitLocation = await prisma.location.findUniqueOrThrow({ where: { id: transfer.inTransitLocationId } });
      expect(inTransitLocation.type).toBe('IN_TRANSIT');
      expect(inTransitLocation.isActive).toBe(false);

      const sourceStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: sourceLocationId } },
      });
      expect(sourceStock.quantity).toBe(6);

      const transitStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: transfer.inTransitLocationId } },
      });
      expect(transitStock.quantity).toBe(4);
    });

    it('receive() in full moves stock from in-transit to destination and marks RECEIVED', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 5, reason: 'ADJUSTMENT' });
      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 5 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      const received = await transfers.receive(actorId, transfer.id);

      expect(received.status).toBe('RECEIVED');
      expect(received.receivedByUserId).toBe(actorId);
      expect(received.lines[0]!.quantityReceived).toBe(5);

      const transitStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: transfer.inTransitLocationId } },
      });
      expect(transitStock.quantity).toBe(0);

      const destStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: destinationLocationId } },
      });
      expect(destStock.quantity).toBe(5);
    });

    it('a short receipt credits only what arrived and write-offs the shortfall from in-transit', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 10, reason: 'ADJUSTMENT' });
      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 10 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);
      const lineId = transfer.lines[0]!.id;

      const received = await transfers.receive(actorId, transfer.id, [{ lineId, quantityReceived: 7 }]);

      expect(received.lines[0]!.quantityReceived).toBe(7);

      const transitStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: transfer.inTransitLocationId } },
      });
      expect(transitStock.quantity).toBe(0); // fully cleared: 7 to destination + 3 written off

      const destStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: destinationLocationId } },
      });
      expect(destStock.quantity).toBe(7);

      const writeOff = await prisma.stockMovement.findFirst({
        where: { variantId: variant.id, refType: 'StockTransfer', refId: transfer.id, reason: 'WRITE_OFF' },
      });
      expect(writeOff?.delta).toBe(-3);
    });

    it('refuses to receive a transfer that is not IN_TRANSIT', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 1, reason: 'ADJUSTMENT' });
      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 1 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      await transfers.receive(actorId, transfer.id);

      await expect(transfers.receive(actorId, transfer.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancel() returns the full dispatched quantity to source and marks CANCELLED', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 8, reason: 'ADJUSTMENT' });
      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 8 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      const cancelled = await transfers.cancel(actorId, transfer.id, 'wrong destination');

      expect(cancelled.status).toBe('CANCELLED');

      const sourceStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: sourceLocationId } },
      });
      expect(sourceStock.quantity).toBe(8); // back to where it started

      const transitStock = await prisma.variantLocationStock.findUniqueOrThrow({
        where: { variantId_locationId: { variantId: variant.id, locationId: transfer.inTransitLocationId } },
      });
      expect(transitStock.quantity).toBe(0);
    });

    it('refuses to cancel a transfer that has already been received', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 1, reason: 'ADJUSTMENT' });
      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 1 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);
      await transfers.receive(actorId, transfer.id);

      await expect(transfers.cancel(actorId, transfer.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('get() 404s for a transfer that does not exist', async () => {
      await expect(transfers.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listLocations() (InventoryService) excludes every IN_TRANSIT bucket', async () => {
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: sourceLocationId, delta: 1, reason: 'ADJUSTMENT' });
      const transfer = await transfers.dispatch(actorId, sourceLocationId, destinationLocationId, [
        { variantId: variant.id, quantity: 1 },
      ]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      const locations = await inventory.listLocations();
      expect(locations.some((l) => l.id === transfer.inTransitLocationId)).toBe(false);
      expect(locations.some((l) => l.id === sourceLocationId)).toBe(true);
    });
  });

  /**
   * resolveTransferSettlement()'s brand-ownership half — R9's policy gating
   * (WO-22.2), exercised through dispatch() since the method itself is
   * private. Real RetailBrand/BrandPolicy/Organization rows, deleted
   * afterward — this is the LOCAL half of R4/R9 the class doc comment
   * describes: two brands sharing one physical database, not a true
   * cross-database saga.
   */
  describe('brand-policy gating (WO-22.2)', () => {
    const createdVariantIds: string[] = [];
    const createdLocationIds: string[] = [];
    const createdTransferIds: string[] = [];
    const createdRetailBrandIds: string[] = [];
    let createdOrganizationId: string | null = null;

    afterAll(async () => {
      await prisma.stockTransferLine.deleteMany({ where: { transferId: { in: createdTransferIds } } });
      await prisma.stockTransfer.deleteMany({ where: { id: { in: createdTransferIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
      await prisma.location.deleteMany({ where: { id: { in: createdLocationIds } } });
      await prisma.brandPolicy.deleteMany({ where: { retailBrandId: { in: createdRetailBrandIds } } });
      await prisma.retailBrand.deleteMany({ where: { id: { in: createdRetailBrandIds } } });
      if (createdOrganizationId) {
        await prisma.organization.delete({ where: { id: createdOrganizationId } });
      }
    });

    async function freshVariant() {
      const variant = await prisma.productVariant.create({
        data: { productId, sku: `TRANSFER-POLICY-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
      createdVariantIds.push(variant.id);
      return variant;
    }

    async function freshBrand(name: string) {
      const brand = await prisma.retailBrand.create({
        data: { name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
      createdRetailBrandIds.push(brand.id);
      return brand;
    }

    async function freshLocation(name: string, retailBrandId: string | null) {
      const location = await prisma.location.create({
        data: { name, code: `POLICY-${Date.now()}-${Math.random().toString(36).slice(2)}`, retailBrandId },
      });
      createdLocationIds.push(location.id);
      return location;
    }

    /**
     * Ensures exactly one Organization row for the duration of a test, since
     * `resolveTransferSettlement()` reads `findFirst()` and this dev
     * database is shared with other suites/sessions — mirrors the same
     * "another session touching the shared DB" caveat documented elsewhere
     * in this repo's test suites. Restores the flag afterward rather than
     * deleting a row this test did not create.
     */
    async function withOrganizationPolicy(allow: boolean, run: () => Promise<void>) {
      const existing = await prisma.organization.findFirst({ select: { id: true, allowInterBrandTransfers: true } });
      if (existing) {
        await prisma.organization.update({ where: { id: existing.id }, data: { allowInterBrandTransfers: allow } });
        try {
          await run();
        } finally {
          await prisma.organization.update({
            where: { id: existing.id },
            data: { allowInterBrandTransfers: existing.allowInterBrandTransfers },
          });
        }
        return;
      }

      const created = await prisma.organization.create({
        data: { name: 'WO-22.2 Test Org', allowInterBrandTransfers: allow },
      });
      createdOrganizationId = created.id;
      await run();
    }

    it('same brand, no BrandPolicy row — proceeds (nothing to check, matches WO-22.1 default)', async () => {
      const brand = await freshBrand('SameBrandNoPolicy');
      const source = await freshLocation('Source', brand.id);
      const destination = await freshLocation('Destination', brand.id);
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 3, reason: 'ADJUSTMENT' });

      const transfer = await transfers.dispatch(actorId, source.id, destination.id, [{ variantId: variant.id, quantity: 3 }]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      const inTransit = await prisma.location.findUniqueOrThrow({ where: { id: transfer.inTransitLocationId } });
      expect(inTransit.retailBrandId).toBe(brand.id);
    });

    it('same brand, BrandPolicy.allowInterBranchTransfers = false — rejected', async () => {
      const brand = await freshBrand('SameBrandBlocked');
      await prisma.brandPolicy.create({ data: { retailBrandId: brand.id, allowInterBranchTransfers: false } });
      const source = await freshLocation('Source', brand.id);
      const destination = await freshLocation('Destination', brand.id);
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 3, reason: 'ADJUSTMENT' });

      await expect(
        transfers.dispatch(actorId, source.id, destination.id, [{ variantId: variant.id, quantity: 3 }]),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('same brand, BrandPolicy.allowInterBranchTransfers = true — proceeds', async () => {
      const brand = await freshBrand('SameBrandAllowed');
      await prisma.brandPolicy.create({ data: { retailBrandId: brand.id, allowInterBranchTransfers: true } });
      const source = await freshLocation('Source', brand.id);
      const destination = await freshLocation('Destination', brand.id);
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 3, reason: 'ADJUSTMENT' });

      const transfer = await transfers.dispatch(actorId, source.id, destination.id, [{ variantId: variant.id, quantity: 3 }]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      expect(transfer.status).toBe('IN_TRANSIT');
    });

    it('cross-brand, one side has no brand — rejected as an incoherent request', async () => {
      const brand = await freshBrand('CrossBrandOneSided');
      const source = await freshLocation('Source', brand.id);
      const destination = await freshLocation('Destination', null);
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 3, reason: 'ADJUSTMENT' });

      await expect(
        transfers.dispatch(actorId, source.id, destination.id, [{ variantId: variant.id, quantity: 3 }]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cross-brand, Organization.allowInterBrandTransfers = false — rejected', async () => {
      const brandA = await freshBrand('CrossBrandA1');
      const brandB = await freshBrand('CrossBrandB1');
      const source = await freshLocation('Source', brandA.id);
      const destination = await freshLocation('Destination', brandB.id);
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 3, reason: 'ADJUSTMENT' });

      await withOrganizationPolicy(false, async () => {
        await expect(
          transfers.dispatch(actorId, source.id, destination.id, [{ variantId: variant.id, quantity: 3 }]),
        ).rejects.toBeInstanceOf(ForbiddenException);
      });
    });

    it('cross-brand, Organization.allowInterBrandTransfers = true — proceeds, in-transit location belongs to neither brand', async () => {
      const brandA = await freshBrand('CrossBrandA2');
      const brandB = await freshBrand('CrossBrandB2');
      const source = await freshLocation('Source', brandA.id);
      const destination = await freshLocation('Destination', brandB.id);
      const variant = await freshVariant();
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 3, reason: 'ADJUSTMENT' });

      await withOrganizationPolicy(true, async () => {
        const transfer = await transfers.dispatch(actorId, source.id, destination.id, [
          { variantId: variant.id, quantity: 3 },
        ]);
        createdTransferIds.push(transfer.id);
        createdLocationIds.push(transfer.inTransitLocationId);

        const inTransit = await prisma.location.findUniqueOrThrow({ where: { id: transfer.inTransitLocationId } });
        expect(inTransit.retailBrandId).toBeNull();
      });
    });
  });

  /**
   * Settlement modes + InterBranchInvoice (RETAIL-ERP.md R12/R17, WO-22.3).
   * `events` (shared, above) is mocked, so these assertions read the exact
   * `InterBranchTransferInvoiced` payload `receive()` builds, without
   * depending on the outbox actually flushing it.
   */
  describe('settlement modes and InterBranchInvoice (WO-22.3)', () => {
    const createdVariantIds: string[] = [];
    const createdLocationIds: string[] = [];
    const createdTransferIds: string[] = [];
    const createdRetailBrandIds: string[] = [];
    let createdOrganizationId: string | null = null;

    afterAll(async () => {
      await prisma.interBranchInvoice.deleteMany({ where: { transferId: { in: createdTransferIds } } });
      await prisma.stockTransferLine.deleteMany({ where: { transferId: { in: createdTransferIds } } });
      await prisma.stockTransfer.deleteMany({ where: { id: { in: createdTransferIds } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
      await prisma.location.deleteMany({ where: { id: { in: createdLocationIds } } });
      await prisma.retailBrand.deleteMany({ where: { id: { in: createdRetailBrandIds } } });
      if (createdOrganizationId) {
        await prisma.organization.delete({ where: { id: createdOrganizationId } });
      }
    });

    beforeEach(() => {
      published.length = 0;
    });

    async function freshVariant(costPrice: number) {
      const variant = await prisma.productVariant.create({
        data: { productId, sku: `TRANSFER-SETTLE-${Date.now()}-${Math.random().toString(36).slice(2)}`, costPrice },
      });
      createdVariantIds.push(variant.id);
      return variant;
    }

    async function freshBrand(name: string) {
      const brand = await prisma.retailBrand.create({
        data: { name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      });
      createdRetailBrandIds.push(brand.id);
      return brand;
    }

    async function freshLocation(name: string, retailBrandId: string | null) {
      const location = await prisma.location.create({
        data: { name, code: `SETTLE-${Date.now()}-${Math.random().toString(36).slice(2)}`, retailBrandId },
      });
      createdLocationIds.push(location.id);
      return location;
    }

    /** See the identical helper in the WO-22.2 describe block above for the full reasoning. */
    async function withOrganizationPolicy(allow: boolean, run: () => Promise<void>) {
      const existing = await prisma.organization.findFirst({ select: { id: true, allowInterBrandTransfers: true } });
      if (existing) {
        await prisma.organization.update({ where: { id: existing.id }, data: { allowInterBrandTransfers: allow } });
        try {
          await run();
        } finally {
          await prisma.organization.update({
            where: { id: existing.id },
            data: { allowInterBrandTransfers: existing.allowInterBrandTransfers },
          });
        }
        return;
      }

      const created = await prisma.organization.create({
        data: { name: 'WO-22.3 Test Org', allowInterBrandTransfers: allow },
      });
      createdOrganizationId = created.id;
      await run();
    }

    it('same brand — settlementMode NONE, no unitCost snapshot, no invoice on receive', async () => {
      const brand = await freshBrand('SettleSameBrand');
      const source = await freshLocation('Source', brand.id);
      const destination = await freshLocation('Destination', brand.id);
      const variant = await freshVariant(500);
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 5, reason: 'ADJUSTMENT' });

      const transfer = await transfers.dispatch(actorId, source.id, destination.id, [{ variantId: variant.id, quantity: 5 }]);
      createdTransferIds.push(transfer.id);
      createdLocationIds.push(transfer.inTransitLocationId);

      expect(transfer.settlementMode).toBe('NONE');
      expect(transfer.lines[0]!.unitCost).toBeNull();

      const received = await transfers.receive(actorId, transfer.id);
      expect((received as any).interBranchInvoice).toBeUndefined();

      const invoice = await prisma.interBranchInvoice.findUnique({ where: { transferId: transfer.id } });
      expect(invoice).toBeNull();
      // NOT `no events at all` — see the note on the cross-brand case below.
      expect(publishedOfType('transfers.inter_branch_invoiced')).toHaveLength(0);
    });

    it('cross-brand INVOICED, received in full — snapshots unitCost at dispatch, raises an InterBranchInvoice at cost, publishes the event', async () => {
      const brandA = await freshBrand('SettleCrossA1');
      const brandB = await freshBrand('SettleCrossB1');
      const source = await freshLocation('Source', brandA.id);
      const destination = await freshLocation('Destination', brandB.id);
      const variant = await freshVariant(700);
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 4, reason: 'ADJUSTMENT' });

      await withOrganizationPolicy(true, async () => {
        const transfer = await transfers.dispatch(actorId, source.id, destination.id, [
          { variantId: variant.id, quantity: 4 },
        ]);
        createdTransferIds.push(transfer.id);
        createdLocationIds.push(transfer.inTransitLocationId);

        expect(transfer.settlementMode).toBe('INVOICED');
        expect(transfer.lines[0]!.unitCost).toBe(700);

        const received: any = await transfers.receive(actorId, transfer.id);

        expect(received.interBranchInvoice).toBeDefined();
        expect(received.interBranchInvoice.amountMinor).toBe(2800); // 700 * 4
        expect(received.interBranchInvoice.sourceRetailBrandId).toBe(brandA.id);
        expect(received.interBranchInvoice.destinationRetailBrandId).toBe(brandB.id);
        expect(received.interBranchInvoice.number).toMatch(/^IBI-\d{4}-\d{4}$/);

        const invoice = await prisma.interBranchInvoice.findUniqueOrThrow({ where: { transferId: transfer.id } });
        expect(invoice.amountMinor).toBe(2800);

        expect(publishedOfType('transfers.inter_branch_invoiced')).toEqual([
          {
            name: 'transfers.inter_branch_invoiced',
            payload: expect.objectContaining({
              invoiceId: invoice.id,
              transferId: transfer.id,
              sourceRetailBrandId: brandA.id,
              destinationRetailBrandId: brandB.id,
              amountMinor: 2800,
            }),
          },
        ]);
      });
    });

    it('cross-brand INVOICED, short receipt — invoices only what actually arrived, not what was dispatched', async () => {
      const brandA = await freshBrand('SettleCrossA2');
      const brandB = await freshBrand('SettleCrossB2');
      const source = await freshLocation('Source', brandA.id);
      const destination = await freshLocation('Destination', brandB.id);
      const variant = await freshVariant(1000);
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 10, reason: 'ADJUSTMENT' });

      await withOrganizationPolicy(true, async () => {
        const transfer = await transfers.dispatch(actorId, source.id, destination.id, [
          { variantId: variant.id, quantity: 10 },
        ]);
        createdTransferIds.push(transfer.id);
        createdLocationIds.push(transfer.inTransitLocationId);
        const lineId = transfer.lines[0]!.id;

        const received: any = await transfers.receive(actorId, transfer.id, [{ lineId, quantityReceived: 6 }]);

        expect(received.interBranchInvoice.amountMinor).toBe(6000); // 1000 * 6, not * 10
      });
    });

    it('cross-brand INVOICED, received entirely short (fully written off) — no invoice for zero', async () => {
      const brandA = await freshBrand('SettleCrossA3');
      const brandB = await freshBrand('SettleCrossB3');
      const source = await freshLocation('Source', brandA.id);
      const destination = await freshLocation('Destination', brandB.id);
      const variant = await freshVariant(400);
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 2, reason: 'ADJUSTMENT' });

      await withOrganizationPolicy(true, async () => {
        const transfer = await transfers.dispatch(actorId, source.id, destination.id, [
          { variantId: variant.id, quantity: 2 },
        ]);
        createdTransferIds.push(transfer.id);
        createdLocationIds.push(transfer.inTransitLocationId);
        const lineId = transfer.lines[0]!.id;

        await transfers.receive(actorId, transfer.id, [{ lineId, quantityReceived: 0 }]);

        const invoice = await prisma.interBranchInvoice.findUnique({ where: { transferId: transfer.id } });
        expect(invoice).toBeNull();
        // NOT `no events at all`: InventoryService.move() publishes
        // StockReplenished on every positive delta, including the setup above.
        expect(publishedOfType('transfers.inter_branch_invoiced')).toHaveLength(0);
      });
    });

    it('get() includes the InterBranchInvoice once raised', async () => {
      const brandA = await freshBrand('SettleCrossA4');
      const brandB = await freshBrand('SettleCrossB4');
      const source = await freshLocation('Source', brandA.id);
      const destination = await freshLocation('Destination', brandB.id);
      const variant = await freshVariant(250);
      await inventory.move({ variantId: variant.id, locationId: source.id, delta: 2, reason: 'ADJUSTMENT' });

      await withOrganizationPolicy(true, async () => {
        const transfer = await transfers.dispatch(actorId, source.id, destination.id, [
          { variantId: variant.id, quantity: 2 },
        ]);
        createdTransferIds.push(transfer.id);
        createdLocationIds.push(transfer.inTransitLocationId);

        await transfers.receive(actorId, transfer.id);

        const fetched: any = await transfers.get(transfer.id);
        expect(fetched.interBranchInvoice.amountMinor).toBe(500); // 250 * 2
      });
    });
  });
});
