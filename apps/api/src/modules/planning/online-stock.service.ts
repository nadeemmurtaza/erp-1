import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../../core/audit/audit.service';

const REASSIGNABLE_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP'];

/**
 * R26 — online stock is the sum of branch allotments, no separate
 * reservation ledger. `onlineStockFor()` is a read-model over
 * `VariantLocationStock`; `assignFulfillingBranch()` is a real write, and
 * the one place this document imports another module's service directly
 * (`planning -> inventory` in `scripts/check-module-boundaries.mjs`'s own
 * `KNOWN_MODULE_COUPLINGS`, the same same-transaction-write exception
 * `orders -> inventory`/`purchasing -> inventory` already use).
 *
 * DEVIATION from this document's own pseudocode: it assumed an order's
 * stock had not yet been decremented anywhere before a branch is assigned.
 * In this codebase's actual order-placement flow (`orders.service.ts`),
 * every order already resolves and decrements a real `locationId` at
 * PLACEMENT time (`order.locationId ?? defaultLocationId()`) — so
 * "assigning a fulfilling branch" is honestly a REASSIGNMENT: reverse the
 * stock commitment at the order's current location, re-commit it at the
 * new one, atomically, both through the identical `InventoryService.move()`
 * writer every other sale already uses — never a second, competing
 * decrement from an unassigned state, which is exactly the "second copy of
 * the write" bug this document set refuses everywhere else.
 */
@Injectable()
export class OnlineStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async onlineStockFor(variantId: string): Promise<number> {
    const rows = await this.prisma.variantLocationStock.findMany({ where: { variantId }, select: { quantity: true } });
    return rows.reduce((sum, r) => sum + r.quantity, 0);
  }

  async assignFulfillingBranch(orderId: string, newLocationId: string, actorId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, locationId: true, items: { select: { variantId: true, quantity: true } } },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (!REASSIGNABLE_STATUSES.includes(order.status)) {
      throw new ConflictException(`An order at ${order.status} can no longer be reassigned to a different fulfilling branch.`);
    }

    const items = order.items.filter((i): i is { variantId: string; quantity: number } => i.variantId !== null);
    if (items.length === 0) throw new BadRequestException('This order has no stock-tracked line items to reassign.');

    await this.prisma.$transaction(async (tx) => {
      const currentLocationId = order.locationId ?? (await this.inventory.defaultLocationId(tx));
      if (currentLocationId === newLocationId) {
        throw new ConflictException('This order is already fulfilled from that location.');
      }

      for (const item of items) {
        await this.inventory.move(
          {
            variantId: item.variantId,
            locationId: currentLocationId,
            delta: item.quantity,
            reason: 'ADJUSTMENT',
            refType: 'Order',
            refId: orderId,
            note: `Fulfilling branch reassigned to ${newLocationId} — reversing commitment at ${currentLocationId}.`,
            actorId,
          },
          tx,
        );
        await this.inventory.move(
          {
            variantId: item.variantId,
            locationId: newLocationId,
            delta: -item.quantity,
            reason: 'ADJUSTMENT',
            refType: 'Order',
            refId: orderId,
            note: `Fulfilling branch reassigned from ${currentLocationId}.`,
            actorId,
          },
          tx,
        );
      }

      await tx.order.update({ where: { id: orderId }, data: { locationId: newLocationId } });
    });

    await this.audit.record({
      actorId,
      action: 'planning.order.fulfilling_branch_reassigned',
      entity: 'Order',
      entityId: orderId,
      data: { newLocationId },
    });
  }
}
