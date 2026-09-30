import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma, SerializedUnit, SerializedUnitStatus } from '../../../core/prisma/client';
import { InventoryService } from './inventory.service';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

export interface ReceiveSerializedUnitsInput {
  variantId: string;
  locationId: string;
  serials: string[];
  unitCost?: number;
  lotId?: string | null;
  refType: string;
  refId: string;
  actorId?: string | null;
}

export interface UnitHistory {
  serialNumber: string;
  status: SerializedUnitStatus;
  soldOn: Date | null;
  orderId: string | null;
  orderNumber: string | null;
  warrantyEndsOn: Date | null;
}

/**
 * 158-serialized-unit-tracking.md. `SerializedUnit` is a sub-ledger under
 * the existing stock row, exactly the shape doc 32's `Lot` already proves —
 * a lot groups many units under one batch identity, a serial gives exactly
 * one unit its own. `InventoryService.move()` stays the only stock writer;
 * this service creates ONE `StockMovement` per physical unit received
 * (delta 1 each), correcting an internal contradiction in this document's
 * own draft (its prose claimed `stockMovementId` unique per movement, its
 * own §2 code sample shared one movement across many serials) — see
 * DECISIONS.md ADR-068 for the full reasoning. A sale or return still moves
 * exactly one unit, one movement, matching the document's own §2 sketch
 * for those two paths unchanged.
 */
@Injectable()
export class SerializedUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Refuses the whole receipt rather than partially creating units (doc
   * 158's own "failure path" answer) — a duplicate serial (already
   * recorded anywhere in this deployment) surfaces as a named conflict,
   * never a raw constraint-violation 500.
   */
  async receiveUnits(input: ReceiveSerializedUnitsInput, tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<SerializedUnit[]> {
    if (input.serials.length === 0) {
      throw new BadRequestException('At least one serial number is required.');
    }
    const distinct = new Set(input.serials);
    if (distinct.size !== input.serials.length) {
      throw new BadRequestException('The same serial number was entered more than once in this receipt.');
    }

    const created: SerializedUnit[] = [];
    for (const serialNumber of input.serials) {
      const movement = await this.inventory.move(
        {
          variantId: input.variantId,
          locationId: input.locationId,
          delta: 1,
          reason: 'PURCHASE_RECEIPT',
          refType: input.refType,
          refId: input.refId,
          unitCost: input.unitCost,
          actorId: input.actorId,
        },
        tx,
      );

      try {
        const unit = await tx.serializedUnit.create({
          data: {
            productVariantId: input.variantId,
            serialNumber,
            locationId: input.locationId,
            lotId: input.lotId ?? null,
            stockMovementId: movement.id,
          },
        });
        created.push(unit);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(`Serial ${serialNumber} is already recorded in this system.`);
        }
        throw error;
      }
    }
    return created;
  }

  /**
   * Never a generic "not found" — a unit already sold elsewhere and a unit
   * physically at the wrong branch are two different operator errors with
   * two different fixes (doc 158 §2, restated).
   */
  async sellUnit(
    input: { serialNumber: string; orderId: string; unitCost?: number; actorId?: string | null },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<SerializedUnit> {
    const unit = await tx.serializedUnit.findUnique({ where: { serialNumber: input.serialNumber } });
    if (!unit) throw new NotFoundException(`Serial ${input.serialNumber} is not recorded in this system.`);
    if (unit.status !== 'IN_STOCK' || !unit.locationId) {
      throw new ConflictException(`Serial ${input.serialNumber} is not available for sale — it is ${unit.status.toLowerCase().replace('_', ' ')}.`);
    }

    const movement = await this.inventory.move(
      {
        variantId: unit.productVariantId,
        locationId: unit.locationId,
        delta: -1,
        reason: 'SALE',
        refType: 'Order',
        refId: input.orderId,
        unitCost: input.unitCost,
        actorId: input.actorId,
      },
      tx,
    );

    return tx.serializedUnit.update({
      where: { id: unit.id },
      data: { status: 'SOLD', orderId: input.orderId, stockMovementId: movement.id, locationId: null },
    });
  }

  /**
   * The toxic-pair guard this document names explicitly (§2/scope lenses):
   * a "return" naming a serial that was never sold on that exact order is
   * refused outright, the same class of self-dealing gap doc 156 already
   * closed for StockVariance.resolve().
   */
  async returnUnit(
    input: { serialNumber: string; orderId: string; locationId: string; actorId?: string | null },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<SerializedUnit> {
    const unit = await tx.serializedUnit.findUnique({ where: { serialNumber: input.serialNumber } });
    if (!unit) throw new NotFoundException(`Serial ${input.serialNumber} is not recorded in this system.`);
    if (unit.status !== 'SOLD' || unit.orderId !== input.orderId) {
      throw new ConflictException(`Serial ${input.serialNumber} was not sold on this order.`);
    }

    const movement = await this.inventory.move(
      {
        variantId: unit.productVariantId,
        locationId: input.locationId,
        delta: 1,
        reason: 'RETURN',
        refType: 'Order',
        refId: input.orderId,
        actorId: input.actorId,
      },
      tx,
    );

    return tx.serializedUnit.update({
      where: { id: unit.id },
      data: { status: 'RETURNED', locationId: input.locationId, stockMovementId: movement.id },
    });
  }

  /** Theft, damage, lost — gated by `inventory.manage` at the route, same as any other stock write; the audit trail is the StockMovement it always produces. */
  async writeOff(
    input: { serialNumber: string; actorId?: string | null; note?: string },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<SerializedUnit> {
    const unit = await tx.serializedUnit.findUnique({ where: { serialNumber: input.serialNumber } });
    if (!unit) throw new NotFoundException(`Serial ${input.serialNumber} is not recorded in this system.`);
    if (unit.status !== 'IN_STOCK' || !unit.locationId) {
      throw new ConflictException(`Serial ${input.serialNumber} cannot be written off — it is ${unit.status.toLowerCase().replace('_', ' ')}.`);
    }

    const movement = await this.inventory.move(
      {
        variantId: unit.productVariantId,
        locationId: unit.locationId,
        delta: -1,
        reason: 'WRITE_OFF',
        refType: 'SerializedUnit',
        refId: unit.id,
        note: input.note,
        actorId: input.actorId,
      },
      tx,
    );

    return tx.serializedUnit.update({
      where: { id: unit.id },
      data: { status: 'WRITTEN_OFF', stockMovementId: movement.id, locationId: null },
    });
  }

  async listForVariant(variantId: string) {
    const units = await this.prisma.serializedUnit.findMany({
      where: { productVariantId: variantId },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return units.map((unit) => ({
      id: unit.id,
      serialNumber: unit.serialNumber,
      status: unit.status,
      locationId: unit.locationId,
      locationName: unit.location?.name ?? null,
      orderId: unit.orderId,
      createdAt: unit.createdAt,
    }));
  }

  /**
   * The warranty/authenticity lookup this data makes possible — a pure
   * read, reachable both staff-side and through a narrow public "verify
   * your purchase" route (doc 158 §3), which returns exactly this shape
   * and nothing more (never a branch, an employee, or any other
   * disclosure).
   */
  async getUnitHistory(serialNumber: string): Promise<UnitHistory | null> {
    const unit = await this.prisma.serializedUnit.findUnique({
      where: { serialNumber },
      include: { variant: { select: { warrantyMonths: true } } },
    });
    if (!unit) return null;

    let soldOn: Date | null = null;
    let orderNumber: string | null = null;
    if (unit.status === 'SOLD' && unit.orderId) {
      const [movement, order] = await Promise.all([
        unit.stockMovementId ? this.prisma.stockMovement.findUnique({ where: { id: unit.stockMovementId }, select: { createdAt: true } }) : null,
        this.prisma.order.findUnique({ where: { id: unit.orderId }, select: { number: true } }),
      ]);
      soldOn = movement?.createdAt ?? null;
      orderNumber = order?.number ?? null;
    }

    let warrantyEndsOn: Date | null = null;
    if (soldOn && unit.variant.warrantyMonths) {
      warrantyEndsOn = new Date(soldOn);
      warrantyEndsOn.setMonth(warrantyEndsOn.getMonth() + unit.variant.warrantyMonths);
    }

    return { serialNumber: unit.serialNumber, status: unit.status, soldOn, orderId: unit.orderId, orderNumber, warrantyEndsOn };
  }
}
