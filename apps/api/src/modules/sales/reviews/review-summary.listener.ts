import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, type ReviewModeratedPayload } from '../../../core/events/domain-events';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { ReviewSummaryService } from './review-summary.service';

/** Only a review that just became visible is worth checking the threshold over — a REJECTED one never grows the published count. */
@Injectable()
export class ReviewSummaryListener {
  private readonly logger = new Logger(ReviewSummaryListener.name);

  constructor(private readonly summaries: ReviewSummaryService) {}

  @OnDomainEvent(DomainEvent.ReviewModerated)
  async onReviewModerated(payload: ReviewModeratedPayload): Promise<void> {
    if (payload.status !== 'PUBLISHED') return;

    try {
      await this.summaries.maybeRegenerate(payload.productId);
    } catch (error) {
      this.logger.error(
        `failed to check/regenerate review summary for product ${payload.productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
