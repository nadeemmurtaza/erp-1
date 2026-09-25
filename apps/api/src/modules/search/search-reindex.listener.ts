import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, type ProductChangedPayload } from '../../core/events/domain-events';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { SearchService } from './search.service';

/**
 * Lives in `search` (the reacting module), subscribing to an event `catalog`
 * publishes — catalog never imports SearchService, same INDEPENDENCE pattern
 * as orders/shipment-status.listener.ts.
 */
@Injectable()
export class SearchReindexListener {
  private readonly logger = new Logger(SearchReindexListener.name);

  constructor(private readonly search: SearchService) {}

  @OnDomainEvent(DomainEvent.ProductChanged)
  async onProductChanged(payload: ProductChangedPayload): Promise<void> {
    try {
      await this.search.reindexProduct(payload.productId);
    } catch (error) {
      this.logger.error(
        `failed to reindex product ${payload.productId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
