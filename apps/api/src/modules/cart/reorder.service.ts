import { Injectable, NotFoundException } from '@nestjs/common';
import type { Locale } from '@newax/shared';
import { DEFAULT_LOCALE } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CartService } from './cart.service';
import type { CartView } from './cart.service';

export interface ReorderResult {
  cart: CartView;
  addedCount: number;
  unavailable: string[];
}

/**
 * WO-7.2 (docs/implementation/customer-portal-loyalty/07-customer-portal.md):
 * "one tap adds every still-available line back to the cart, and says
 * plainly which lines are unavailable rather than silently dropping them."
 *
 * Scoped to readymade lines only — a stitching-service line carries its own
 * measurements/design choices (orders.prisma's own comment on why core
 * cannot even type a relation to StitchingJob), and re-adding one correctly
 * would mean re-running that whole booking flow, not a cart line. Those are
 * reported back as unavailable-to-reorder rather than silently skipped, same
 * as a discontinued product would be.
 *
 * A plain Prisma read of Order/OrderItem here — never an import of
 * OrdersService — keeps this a same-pack read, not a same-transaction write,
 * so it needs no KNOWN_MODULE_COUPLINGS entry (scripts/check-module-boundaries.mjs).
 */
@Injectable()
export class ReorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
  ) {}

  async reorder(userId: string, orderNumber: string, locale: Locale = DEFAULT_LOCALE): Promise<ReorderResult> {
    const order = await this.prisma.order.findFirst({
      where: { number: orderNumber, userId },
      include: { items: { include: { variant: true } } },
    });
    if (!order) throw new NotFoundException('Order not found.');

    const unavailable: string[] = [];
    let addedCount = 0;
    let cart: CartView | null = null;

    for (const item of order.items) {
      if (item.stitchingServiceId || !item.variantId || !item.variant) {
        unavailable.push(item.nameEn);
        continue;
      }
      if (!item.variant.isActive || item.variant.stock <= 0) {
        unavailable.push(item.nameEn);
        continue;
      }
      try {
        cart = await this.cart.addItem(undefined, userId, { variantId: item.variantId, quantity: item.quantity }, locale);
        addedCount += 1;
      } catch {
        unavailable.push(item.nameEn);
      }
    }

    if (!cart) cart = await this.cart.getOrCreate(undefined, userId, locale);
    return { cart, addedCount, unavailable };
  }
}
