import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
 * TransfersService (RETAIL-ERP.md R4, WO-22.1) — real Postgres, real
 * InventoryService, so these assertions are about the actual invariant: an
 * in-transit Location holds exactly what has left the source and not yet
 * reached the destination, and the ledger explains a short receipt rather
 * than letting it vanish.
 */
describe('TransfersService — dispatch/receive/cancel (WO-22.1)', () => {
  let transfers: TransfersService;
  let inventory: InventoryService;
  let prisma: PrismaService;
  let sourceLocationId: string;
  let destinationLocationId: string;
  let productId: string;
  let actorId: string;
  const createdVariantIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdTransferIds: string[] = [];

  beforeAll(async () => {
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
        { provide: EventBusService, useValue: { publish: jest.fn() } },
      ],
    }).compile();

    transfers = module.get(TransfersService);
    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);

    const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
    productId = product.id;

    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    actorId = user.id;

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
