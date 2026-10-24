import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PosReceiptsService } from './pos-receipts.service';
import type { PosInstalmentPlanDto, PosSaleLineDto } from './dto/pos-sale.dto';

/**
 * The till's own half of the `pos -> orders` hand-off (RETAIL-ERP.md R11):
 * resolves which terminal/location a shift belongs to and refuses a sale
 * against anything but an OPEN shift, then hands a validated line list to
 * OrdersService.placeFromPos() — the part that actually owns the Order
 * invariant. This module never writes an Order row itself.
 */
@Injectable()
export class PosSalesService {
  private readonly logger = new Logger(PosSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly receipts: PosReceiptsService,
  ) {}

  async sell(
    shiftId: string,
    cashierUserId: string,
    lines: PosSaleLineDto[],
    customer: { customerName?: string; customerPhone?: string; customerEmail?: string },
    instalmentPlan?: PosInstalmentPlanDto,
  ) {
    const shift = await this.prisma.posShift.findUnique({
      where: { id: shiftId },
      include: { terminal: true },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') {
      throw new BadRequestException('This shift is closed — open a new shift before ringing up a sale.');
    }

    const order = await this.orders.placeFromPos({
      locationId: shift.terminal.locationId,
      terminalId: shift.terminalId,
      shiftId: shift.id,
      cashierUserId,
      // pos-hardware/31 §2 — only priceDeltaMinor crosses into `orders`;
      // key/label are pos-owned display metadata recorded separately below.
      lines: lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        modifiers: line.modifiers?.map((m) => ({ priceDeltaMinor: m.priceDeltaMinor })),
      })),
      ...customer,
      instalmentPlan: instalmentPlan
        ? { ...instalmentPlan, schedule: instalmentPlan.schedule.map((l) => ({ ...l, dueDate: new Date(l.dueDate) })) }
        : undefined,
    });

    // Best-effort, outside the sale's own transaction (WO-21.5) — a receipt
    // row is bookkeeping for reprinting, never something the sale's own
    // correctness depends on. Its absence should never surface as a failed
    // sale to the cashier.
    await this.receipts.createForOrder(order.id).catch((error: unknown) => {
      this.logger.warn(`Could not record a receipt for order ${order.number}: ${String(error)}`);
    });

    // pos-hardware/31 §2/WO-31.2 — the modifier set / non-typed quantity
    // source, keyed by the till-generated lineRef. Best-effort, same
    // discipline as the receipt write two lines above: pos-owned display
    // and audit metadata, deliberately NOT linked to the created OrderItem
    // by id (no @relation across the pos/orders boundary), so its absence
    // must never fail or reverse an already-completed sale.
    await this.recordLineMetadata(lines).catch((error: unknown) => {
      this.logger.warn(`Could not record line modifier/quantity-source metadata for order ${order.number}: ${String(error)}`);
    });

    return order;
  }

  private async recordLineMetadata(lines: PosSaleLineDto[]): Promise<void> {
    for (const line of lines) {
      if (!line.lineRef) continue;

      if (line.modifiers && line.modifiers.length > 0) {
        await this.prisma.posLineModifier.createMany({
          data: line.modifiers.map((m) => ({
            lineRef: line.lineRef!,
            key: m.key,
            label: m.label,
            priceDeltaMinor: m.priceDeltaMinor,
          })),
        });
      }

      if (line.quantitySource && line.quantitySource.source !== 'TYPED') {
        await this.prisma.posLineQuantitySource.create({
          data: {
            lineRef: line.lineRef,
            source: line.quantitySource.source,
            recipeId: line.quantitySource.recipeId ?? null,
          },
        });
      }
    }
  }
}
