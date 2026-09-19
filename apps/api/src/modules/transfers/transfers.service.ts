import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { documentPrefix } from '../../core/settings/document-prefix';
import { documentNumber } from '../../core/settings/document-number';
import { InventoryService } from '../inventory/inventory.service';
import type { Location, Prisma } from '../../core/prisma/client';

export interface TransferLineInput {
  variantId: string;
  quantity: number;
}

export interface ReceiveLineInput {
  lineId: string;
  /** Omit to receive exactly what was dispatched. */
  quantityReceived?: number;
}

/**
 * Inter-branch and inter-brand stock transfers (RETAIL-ERP.md R4, WO-22.1
 * + WO-22.2). `dispatch()` and `receive()` are the two local operations R4
 * names — "Dispatch is one local moveMany() at source; receipt is another
 * at destination" — each its own transaction, never a distributed one
 * spanning two databases (R3: no distributed transactions, ever).
 *
 * `dispatch()` also gates on R9's policy switches —
 * `BrandPolicy.allowInterBranchTransfers` for a same-brand transfer,
 * `Organization.allowInterBrandTransfers` for a genuinely brand-crossing
 * one — see `resolveTransferBrandOwnership()` below for the full reasoning,
 * including what WO-22.2 does and does not honestly cover.
 *
 * Imports InventoryService directly (`transfers -> inventory` in
 * KNOWN_MODULE_COUPLINGS, anticipated by R11 itself) because every stock
 * change here must commit in the same transaction as the StockTransfer
 * status write it belongs to — the same reasoning `orders -> inventory`
 * already carries. Reads Organization/BrandPolicy directly via Prisma
 * rather than importing OrganizationModule — a read, not a
 * same-transaction write, needs no coupling entry (the same precedent
 * PosCatalogService and OrdersService.placeFromPos() already set).
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly inventory: InventoryService,
  ) {}

  async dispatch(actorId: string, sourceLocationId: string, destinationLocationId: string, lines: TransferLineInput[], note?: string) {
    if (sourceLocationId === destinationLocationId) {
      throw new BadRequestException('Source and destination must be different locations.');
    }
    if (lines.length === 0) {
      throw new BadRequestException('A transfer needs at least one line.');
    }
    for (const line of lines) {
      if (line.quantity <= 0) throw new BadRequestException('Every line quantity must be positive.');
    }

    const [source, destination] = await Promise.all([
      this.prisma.location.findUnique({ where: { id: sourceLocationId } }),
      this.prisma.location.findUnique({ where: { id: destinationLocationId } }),
    ]);
    if (!source) throw new BadRequestException('Source location does not exist.');
    if (!destination) throw new BadRequestException('Destination location does not exist.');

    const inTransitRetailBrandId = await this.resolveTransferBrandOwnership(source, destination);

    const variantIds = [...new Set(lines.map((l) => l.variantId))];
    const variantCount = await this.prisma.productVariant.count({ where: { id: { in: variantIds } } });
    if (variantCount !== variantIds.length) {
      throw new BadRequestException('One or more variants do not exist.');
    }

    const number = await nextTransferNumber(this.prisma, this.settings, this.config);

    return this.prisma.$transaction(async (tx) => {
      const inTransitLocation = await tx.location.create({
        data: {
          name: `In transit — ${number}`,
          code: `IT-${number}`,
          type: 'IN_TRANSIT',
          // Same brand as both ends (including the today's-default "no
          // brand at all" case, both null): the in-transit bucket belongs
          // to that brand too. Crossing brands (WO-22.2, R4): null — it
          // "belongs to neither brand", the organization tier's own
          // in-transit location, per resolveTransferBrandOwnership() below.
          retailBrandId: inTransitRetailBrandId,
          // isActive: false keeps it out of InventoryService.listLocations()
          // (below) without that list needing to know IN_TRANSIT exists —
          // it already filters on isActive, the same flag a real
          // deactivated branch would use.
          isActive: false,
        },
      });

      const transfer = await tx.stockTransfer.create({
        data: {
          number,
          sourceLocationId,
          destinationLocationId,
          inTransitLocationId: inTransitLocation.id,
          createdByUserId: actorId,
          note: note?.trim() || null,
          lines: {
            create: lines.map((line) => ({ variantId: line.variantId, quantityDispatched: line.quantity })),
          },
        },
        include: { lines: true },
      });

      // Sorted the same way moveMany() locks — see orders.service.ts's own
      // comment on this pattern for why it matters under concurrent writers.
      const sortedLines = [...transfer.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));
      await this.inventory.moveMany(
        sortedLines.flatMap((line) => [
          {
            variantId: line.variantId,
            locationId: sourceLocationId,
            delta: -line.quantityDispatched,
            reason: 'TRANSFER_OUT' as const,
            refType: 'StockTransfer',
            refId: transfer.id,
            actorId,
          },
          {
            variantId: line.variantId,
            locationId: inTransitLocation.id,
            delta: line.quantityDispatched,
            reason: 'TRANSFER_OUT' as const,
            refType: 'StockTransfer',
            refId: transfer.id,
            actorId,
          },
        ]),
        tx,
      );

      return transfer;
    }, { timeout: 20_000 });
  }

  async receive(actorId: string, transferId: string, lineOverrides: ReceiveLineInput[] = []) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id: transferId }, include: { lines: true } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(`This transfer is ${transfer.status.toLowerCase()}, not in transit — nothing to receive.`);
    }

    const overrideByLine = new Map(lineOverrides.map((o) => [o.lineId, o.quantityReceived]));
    for (const [lineId, qty] of overrideByLine) {
      if (qty !== undefined && qty < 0) throw new BadRequestException('quantityReceived cannot be negative.');
      if (!transfer.lines.some((l) => l.id === lineId)) {
        throw new BadRequestException(`Line ${lineId} does not belong to this transfer.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const sortedLines = [...transfer.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));

      for (const line of sortedLines) {
        const received = overrideByLine.get(line.id) ?? line.quantityDispatched;
        const shortfall = line.quantityDispatched - received;

        await tx.stockTransferLine.update({ where: { id: line.id }, data: { quantityReceived: received } });

        if (received > 0) {
          await this.inventory.move(
            {
              variantId: line.variantId,
              locationId: transfer.inTransitLocationId,
              delta: -received,
              reason: 'TRANSFER_IN',
              refType: 'StockTransfer',
              refId: transfer.id,
              actorId,
            },
            tx,
          );
          await this.inventory.move(
            {
              variantId: line.variantId,
              locationId: transfer.destinationLocationId,
              delta: received,
              reason: 'TRANSFER_IN',
              refType: 'StockTransfer',
              refId: transfer.id,
              actorId,
            },
            tx,
          );
        }

        // A short receipt is a real loss, not a rounding error — write it
        // off explicitly rather than letting it vanish as an unexplained
        // gap between what left the in-transit bucket and what arrived.
        if (shortfall > 0) {
          await this.inventory.move(
            {
              variantId: line.variantId,
              locationId: transfer.inTransitLocationId,
              delta: -shortfall,
              reason: 'WRITE_OFF',
              refType: 'StockTransfer',
              refId: transfer.id,
              actorId,
              note: `Short receipt on transfer ${transfer.number}: dispatched ${line.quantityDispatched}, received ${received}.`,
            },
            tx,
          );
        }
      }

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'RECEIVED', receivedAt: new Date(), receivedByUserId: actorId },
        include: { lines: true },
      });
    }, { timeout: 20_000 });
  }

  async cancel(actorId: string, transferId: string, note?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id: transferId }, include: { lines: true } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(`This transfer is already ${transfer.status.toLowerCase()} — it cannot be cancelled.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const sortedLines = [...transfer.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));

      await this.inventory.moveMany(
        sortedLines.flatMap((line) => [
          {
            variantId: line.variantId,
            locationId: transfer.inTransitLocationId,
            delta: -line.quantityDispatched,
            reason: 'TRANSFER_IN' as const,
            refType: 'StockTransfer',
            refId: transfer.id,
            actorId,
            note: 'Transfer cancelled — returned to source.',
          },
          {
            variantId: line.variantId,
            locationId: transfer.sourceLocationId,
            delta: line.quantityDispatched,
            reason: 'TRANSFER_IN' as const,
            refType: 'StockTransfer',
            refId: transfer.id,
            actorId,
          },
        ]),
        tx,
      );

      return tx.stockTransfer.update({
        where: { id: transferId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), note: note?.trim() || transfer.note },
        include: { lines: true },
      });
    }, { timeout: 20_000 });
  }

  async list(query: { status?: 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED'; page: number; pageSize: number }) {
    const where: Prisma.StockTransferWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);
    return { data: rows, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async get(id: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id }, include: { lines: true } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  /**
   * R9's two policy switches, gated at the one tier that exists today
   * (there is no separate "receiving tier" to also enforce it against in a
   * STANDALONE deployment — this IS the ingest point). Returns the
   * `retailBrandId` the transfer's own in-transit Location should carry.
   *
   * Same brand (including today's default deployment, where every Location
   * has `retailBrandId: null` — WO-22.1's own behavior, unchanged): checked
   * against that brand's own `BrandPolicy.allowInterBranchTransfers` only
   * when a real `RetailBrand` is actually involved; a `null`-brand transfer
   * has no `BrandPolicy` row to check and always proceeds, exactly as
   * WO-22.1 shipped.
   *
   * Different brands (WO-22.2, R4): a genuine inter-brand transfer needs
   * BOTH locations to name a real brand — crossing from "no brand" into "a
   * brand" is not a coherent request — and checks
   * `Organization.allowInterBrandTransfers`. The in-transit location gets
   * `retailBrandId: null`: it "belongs to neither brand" (R4's own words),
   * the organization tier's own bucket.
   *
   * This is the LOCAL half of R4/R9 — genuinely testable today, for two
   * `RetailBrand` rows sharing one physical database (sub-brands, Part 1).
   * A true inter-brand transfer between two SEPARATE brand deployments
   * (Br1) needs the replication engine to carry this fact from one
   * database to another and is not something a STANDALONE dev environment
   * can honestly build or verify — deferred, not faked.
   */
  private async resolveTransferBrandOwnership(source: Location, destination: Location): Promise<string | null> {
    if (source.retailBrandId === destination.retailBrandId) {
      if (source.retailBrandId) {
        const policy = await this.prisma.brandPolicy.findUnique({ where: { retailBrandId: source.retailBrandId } });
        if (policy && !policy.allowInterBranchTransfers) {
          throw new ForbiddenException('This brand does not allow transfers between its own branches.');
        }
      }
      return source.retailBrandId;
    }

    if (!source.retailBrandId || !destination.retailBrandId) {
      throw new BadRequestException(
        'Cannot transfer between a brand-owned location and one with no brand — assign both a RetailBrand first.',
      );
    }

    const organization = await this.prisma.organization.findFirst({ select: { allowInterBrandTransfers: true } });
    if (!organization || !organization.allowInterBrandTransfers) {
      throw new ForbiddenException('Inter-brand transfers are not enabled for this organization.');
    }

    return null;
  }
}

/**
 * Node-prefixed per R6, the same TransferNumberCounter pattern
 * orders.service.ts's nextOrderNumber() uses — see that function's own doc
 * comment for the full concurrency reasoning this mirrors exactly.
 */
async function nextTransferNumber(
  prisma: PrismaService,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'stockTransfer');

  const [{ counter }] = await prisma.$queryRaw<Array<{ counter: number }>>`
    INSERT INTO "TransferNumberCounter" ("year", "counter") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "counter" = "TransferNumberCounter"."counter" + 1
    RETURNING "counter"
  `;

  return documentNumber(config, prefix, year, counter);
}
