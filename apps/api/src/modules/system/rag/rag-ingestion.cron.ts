import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RagIngestionService } from './rag-ingestion.service';

/**
 * WO-35.2's own "every step is a cron/queue-driven job" — `finance.cron.ts`'s
 * exact shape. Every five minutes rather than hourly: an ingestion job is
 * short (a handful of documents) and a person waiting on the admin queue to
 * turn READY should not wait up to an hour for the next tick. A missed tick
 * is not retried until the next one — harmless, since `RagIngestionService
 * .processQueued()` simply picks up whatever is still QUEUED.
 */
@Injectable()
export class RagIngestionCron {
  private readonly logger = new Logger(RagIngestionCron.name);

  constructor(private readonly ingestion: RagIngestionService) {}

  @Cron('*/5 * * * *')
  async run(): Promise<void> {
    const { processed, succeeded, failed } = await this.ingestion.processQueued();
    if (processed > 0) {
      this.logger.log(`RAG ingestion: ${succeeded} ready, ${failed} failed or re-queued, of ${processed} processed`);
    }
  }
}
