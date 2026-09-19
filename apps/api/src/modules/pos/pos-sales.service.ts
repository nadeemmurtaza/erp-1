import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PosReceiptsService } from './pos-receipts.service';
import type { PosSaleLineDto } from './dto/pos-sale.dto';

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
      lines,
      ...customer,
    });

    // Best-effort, outside the sale's own transaction (WO-21.5) — a receipt
    // row is bookkeeping for reprinting, never something the sale's own
    // correctness depends on. Its absence should never surface as a failed
    // sale to the cashier.
    await this.receipts.createForOrder(order.id).catch((error: unknown) => {
      this.logger.warn(`Could not record a receipt for order ${order.number}: ${String(error)}`);
    });

    return order;
  }
}
