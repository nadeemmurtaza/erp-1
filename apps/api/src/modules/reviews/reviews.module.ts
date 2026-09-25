import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsPublicController } from './reviews-public.controller';
import { ReviewsService } from './reviews.service';
import { ReviewSummaryService } from './review-summary.service';
import { ReviewSummaryListener } from './review-summary.listener';

@Module({
  controllers: [ReviewsController, ReviewsPublicController],
  providers: [ReviewsService, ReviewSummaryService, ReviewSummaryListener],
  exports: [ReviewsService],
})
export class ReviewsModule {}
