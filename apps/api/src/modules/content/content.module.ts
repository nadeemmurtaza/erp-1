import { Module } from '@nestjs/common';
import { ContentAdminController, ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [ContentAdminController, ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
