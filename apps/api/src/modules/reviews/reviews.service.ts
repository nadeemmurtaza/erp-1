import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import type { Review } from '../../core/prisma/client';
import type { CreateReviewDto, ModerateReviewDto, ReviewQueryDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: EventBusService,
  ) {}

  /** Published reviews for a product's own page — the only ones a shopper ever sees. */
  async listPublished(productId: string, query: { skip: number; take: number }): Promise<PaginatedResult<Review>> {
    const where = { productId, status: 'PUBLISHED' as const };
    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(data, total, { page: Math.floor(query.skip / query.take) + 1, pageSize: query.take });
  }

  /** Rating count/average for JSON-LD's AggregateRating — published reviews only. */
  async ratingSummary(productId: string): Promise<{ count: number; average: number | null }> {
    const agg = await this.prisma.review.aggregate({
      where: { productId, status: 'PUBLISHED' },
      _count: true,
      _avg: { rating: true },
    });
    return { count: agg._count, average: agg._avg.rating };
  }

  async myReviews(userId: string): Promise<Review[]> {
    return this.prisma.review.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Links the review to the customer's own purchased line when one exists
   * and is not already reviewed — that is what "Verified purchase" actually
   * means here, not a self-reported checkbox. `reviews.verified_purchase_only`
   * (default true) refuses the write entirely when none exists; off, the
   * review is still accepted, just without the badge.
   */
  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    const verifiedOnly = await this.settings.get<boolean>(SettingKey.ReviewsVerifiedPurchaseOnly);

    const orderItem = await this.prisma.orderItem.findFirst({
      where: {
        productId: dto.productId,
        review: null,
        order: { userId, status: 'DELIVERED' },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!orderItem && verifiedOnly) {
      throw new ForbiddenException('Only customers who have received this product may review it.');
    }

    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
    });
    if (existing) {
      throw new BadRequestException('You have already reviewed this product.');
    }

    return this.prisma.review.create({
      data: {
        productId: dto.productId,
        userId,
        orderItemId: orderItem?.id,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        photoUrls: dto.photoUrls ?? [],
        fitFeedback: dto.fitFeedback,
      },
    });
  }

  /** Anyone may mark a published review helpful — no per-visitor dedup exists
   * yet (would need its own vote-tracking table), so this is an honest,
   * rate-limited counter rather than a claim of "N people found this helpful"
   * that cannot be gamed. */
  async markHelpful(id: string): Promise<Review> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review || review.status !== 'PUBLISHED') throw new NotFoundException('Review not found.');
    return this.prisma.review.update({ where: { id }, data: { helpfulCount: { increment: 1 } } });
  }

  async listForModeration(query: ReviewQueryDto): Promise<PaginatedResult<Review>> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: query.order },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginated(data, total, query);
  }

  async moderate(id: string, dto: ModerateReviewDto): Promise<Review> {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found.');
    const updated = await this.prisma.review.update({
      where: { id },
      data: { status: dto.status, staffReply: dto.staffReply ?? review.staffReply },
    });

    await this.events.publish(DomainEvent.ReviewModerated, {
      reviewId: updated.id,
      productId: updated.productId,
      status: dto.status,
    });

    return updated;
  }
}
