import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedOnly, CurrentUser, CustomerScope, Public } from '../../../core/auth/decorators';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';
import { ReviewsService } from './reviews.service';
import { ReviewSummaryService } from './review-summary.service';
import { CreateReviewDto } from './dto/review.dto';

@ApiTags('reviews')
@Controller()
export class ReviewsPublicController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly summaries: ReviewSummaryService,
  ) {}

  @Get('products/:productId/reviews')
  @Public()
  @ApiOperation({ summary: "A product's published reviews" })
  async listForProduct(@Param('productId') productId: string, @Query() query: PaginationQueryDto) {
    return this.reviews.listPublished(productId, { skip: query.skip, take: query.take });
  }

  @Get('products/:productId/reviews/summary')
  @Public()
  @ApiOperation({ summary: 'WO-9.9 — the cached AI review summary, or null until enough reviews exist' })
  async summary(@Param('productId') productId: string) {
    return this.summaries.getSummary(productId);
  }

  @Get('reviews/mine')
  @AuthenticatedOnly()
  @CustomerScope('reviews:read')
  @ApiOperation({ summary: 'My own reviews, any status' })
  async mine(@CurrentUser('id') userId: string) {
    return this.reviews.myReviews(userId);
  }

  @Post('reviews')
  @AuthenticatedOnly()
  @CustomerScope('reviews:write')
  @ApiOperation({ summary: 'Submit a review — goes to PENDING, moderated before it shows' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(userId, dto);
  }

  @Post('reviews/:id/helpful')
  @Public()
  @ApiOperation({ summary: 'Mark a review helpful' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async markHelpful(@Param('id') id: string) {
    return this.reviews.markHelpful(id);
  }
}
