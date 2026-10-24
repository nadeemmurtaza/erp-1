import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, type ReturnRequestStatusChangedPayload, type ReviewModeratedPayload } from '../../../core/events/domain-events';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SizeBiasService } from './size-bias.service';

/**
 * Reacts to signals ProductSizeBias is built from — lives in `measurements`
 * (the reacting module), subscribing to events `reviews` and `fulfilment`
 * publish, same independence pattern as search/search-reindex.listener.ts.
 */
@Injectable()
export class SizeBiasListener {
  private readonly logger = new Logger(SizeBiasListener.name);

  constructor(
    private readonly sizeBias: SizeBiasService,
    private readonly prisma: PrismaService,
  ) {}

  @OnDomainEvent(DomainEvent.ReviewModerated)
  async onReviewModerated(payload: ReviewModeratedPayload): Promise<void> {
    try {
      await this.sizeBias.recompute(payload.productId);
    } catch (error) {
      this.logger.error(
        `failed to recompute size bias for product ${payload.productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Only a brand-new return submission carries a fresh reason worth recomputing over — later status transitions on the same request don't change why it was filed. */
  @OnDomainEvent(DomainEvent.ReturnRequestStatusChanged)
  async onReturnRequestStatusChanged(payload: ReturnRequestStatusChangedPayload): Promise<void> {
    if (payload.fromStatus !== null) return;

    try {
      const items = await this.prisma.returnRequestItem.findMany({
        where: { returnId: payload.returnId },
        select: { orderItem: { select: { productId: true } } },
      });
      const productIds = new Set(
        items.map((item) => item.orderItem.productId).filter((productId): productId is string => productId !== null),
      );
      for (const productId of productIds) {
        await this.sizeBias.recompute(productId);
      }
    } catch (error) {
      this.logger.error(
        `failed to recompute size bias for return ${payload.returnId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
