import { Module } from '@nestjs/common';
import { SearchAdminController, SearchController } from './search.controller';
import { SearchReindexListener } from './search-reindex.listener';
import { SearchEmbeddingCron } from './search-embedding.cron';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController, SearchAdminController],
  providers: [SearchService, SearchReindexListener, SearchEmbeddingCron],
  exports: [SearchService],
})
export class SearchModule {}
