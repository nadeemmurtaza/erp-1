import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderStatusChangedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { LoyaltyService } from './loyalty.service';

/**
 * WO-7.7: points earned on DELIVERED, reversed on DELIVERED -> RETURNED (the
 * only transition out of DELIVERED — see orders.service.ts's
 * ALLOWED_TRANSITIONS), never on placement or on CANCELLED (unreachable from
 * DELIVERED, so nothing to reverse there — exit criterion #5 is structural,
 * not a special case). The referral reward checks the same DELIVERED
 * transition for the referEE's own first order.
 */
@Injectable()
export class LoyaltyOrderListener {
  private readonly logger = new Logger(LoyaltyOrderListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyalty: LoyaltyService,
  ) {}

  @OnDomainEvent(DomainEvent.OrderStatusChanged)
  async onOrderStatusChanged(payload: OrderStatusChangedPayload): Promise<void> {
    if (payload.toStatus === 'DELIVERED') {
      await this.loyalty.earnForOrder(payload.orderId);

      const order = await this.prisma.order.findUnique({ where: { id: payload.orderId }, select: { userId: true } });
      if (order?.userId) {
        try {
          await this.loyalty.rewardReferralIfEligible(order.userId);
        } catch (error) {
          this.logger.error(`referral reward failed for order ${payload.orderId}: ${(error as Error).message}`);
        }
      }
      return;
    }

    if (payload.toStatus === 'RETURNED') {
      await this.loyalty.reverseForOrder(payload.orderId);
    }
  }
}
