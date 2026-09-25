import { Module } from '@nestjs/common';
import { SearchAdminController, SearchController } from './search.controller';
import { SearchReindexListener } from './search-reindex.listener';
import { SearchService } from './search.service';

@Module({
  controllers: [SearchController, SearchAdminController],
  providers: [SearchService, SearchReindexListener],
  exports: [SearchService],
})
export class SearchModule {}
