import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../../core/auth/decorators';
import { ReviewsService } from './reviews.service';
import { ModerateReviewDto, ReviewQueryDto } from './dto/review.dto';

/** Staff moderation — every review starts PENDING and is spam-prone by design (WO-7.5). */
@ApiTags('reviews')
@Controller('admin/reviews')
@RequirePermission('reviews.moderate')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List reviews for moderation' })
  async list(@Query() query: ReviewQueryDto) {
    return this.reviews.listForModeration(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Publish, reject, or reply to a review' })
  async moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) {
    return this.reviews.moderate(id, dto);
  }
}
