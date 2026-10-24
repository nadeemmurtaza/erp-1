import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { SearchService } from './search.service';

/**
 * WO-9.5 (09-ai-layer.md) — "Re-embed on product change, in the background,
 * batched." SearchReindexListener only nulls a changed product's embedding
 * out (cheap, synchronous); this is the one place that actually calls the AI
 * provider, on its own timer and in small batches, so an edit spree never
 * fires one embedding call per save. A no-op run (0 pending, or no
 * embedding-capable provider configured) logs nothing — this ticks often
 * enough that a log line every time would be noise, not signal.
 */
@Injectable()
export class SearchEmbeddingCron {
  private readonly logger = new Logger(SearchEmbeddingCron.name);

  constructor(
    private readonly search: SearchService,
    private readonly settings: SettingsService,
  ) {}

  @Cron('*/10 * * * *')
  async embedPending(): Promise<void> {
    const batchSize = await this.settings.get<number>(SettingKey.SearchEmbeddingBatchSize);
    const embedded = await this.search.embedPendingTranslations(batchSize);
    if (embedded > 0) {
      this.logger.log(`Embedded ${embedded} product translation(s) for semantic search`);
    }
  }
}
