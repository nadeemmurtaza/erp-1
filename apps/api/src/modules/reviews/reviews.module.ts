import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsPublicController } from './reviews-public.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, ReviewsPublicController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
