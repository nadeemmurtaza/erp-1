import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface PosReceiptData {
  orderNumber: string;
  placedAt: Date;
  terminalId: string | null;
  cashierUserId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  lines: Array<{ nameEn: string; sku: string | null; quantity: number; unitPrice: number; lineTotal: number }>;
  itemsSubtotal: number;
  grandTotal: number;
  paymentProvider: string | null;
  printCount: number;
  printedAt: Date | null;
}

/**
 * One receipt per POS sale (WO-21.5). Queries Order/OrderItem/Payment
 * directly via PrismaService rather than importing OrdersModule — the same
 * "same shared database, no cross-module service import for a read" pattern
 * PosCatalogService (WO-21.4) already set; needs no KNOWN_MODULE_COUPLINGS
 * entry.
 *
 * `createForOrder()` is called by PosSalesService right after a successful
 * sale — deliberately best-effort and outside that call's own transaction,
 * the same reasoning AuditService.record() already uses: a receipt row is
 * bookkeeping for reprinting, never something a sale's correctness depends
 * on, so a failure here must never roll back or fail the sale itself.
 */
@Injectable()
export class PosReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForOrder(orderId: string): Promise<void> {
    await this.prisma.posReceipt.upsert({
      where: { orderId },
      create: { orderId },
      update: {},
    });
  }

  async getForOrder(orderId: string): Promise<PosReceiptData> {
    const [receipt, order] = await Promise.all([
      this.prisma.posReceipt.findUnique({ where: { orderId } }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
          statusEvents: { orderBy: { createdAt: 'asc' }, take: 1 },
        },
      }),
    ]);

    if (!order) throw new NotFoundException('Order not found');
    if (!receipt) throw new NotFoundException('No receipt was recorded for this order');

    return {
      orderNumber: order.number,
      placedAt: order.placedAt,
      terminalId: order.terminalId,
      cashierUserId: order.statusEvents[0]?.actorId ?? null,
      customerName: order.guestName,
      customerPhone: order.guestPhone,
      lines: order.items.map((item) => ({
        nameEn: item.nameEn,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      itemsSubtotal: order.itemsSubtotal,
      grandTotal: order.grandTotal,
      paymentProvider: order.payments[0]?.provider ?? null,
      printCount: receipt.printCount,
      printedAt: receipt.printedAt,
    };
  }

  async markPrinted(orderId: string): Promise<PosReceiptData> {
    const receipt = await this.prisma.posReceipt.findUnique({ where: { orderId } });
    if (!receipt) throw new NotFoundException('No receipt was recorded for this order');

    await this.prisma.posReceipt.update({
      where: { orderId },
      data: { printCount: { increment: 1 }, printedAt: new Date() },
    });

    return this.getForOrder(orderId);
  }
}
