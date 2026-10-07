import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { DomainEvent } from '../../../core/events/domain-events';

describe('ReviewsService — moderate', () => {
  let service: ReviewsService;
  let prisma: any;
  let events: any;

  beforeEach(async () => {
    prisma = {
      review: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    events = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: { get: jest.fn() } },
        { provide: EventBusService, useValue: events },
      ],
    }).compile();

    service = module.get(ReviewsService);
  });

  it('404s when moderating a review that no longer exists', async () => {
    prisma.review.findUnique.mockResolvedValue(null);

    await expect(service.moderate('missing', { status: 'PUBLISHED' })).rejects.toThrow(NotFoundException);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('publishes ReviewModerated with the new status once a review is published', async () => {
    prisma.review.findUnique.mockResolvedValue({ id: 'rev1', productId: 'prod1', staffReply: null });
    prisma.review.update.mockResolvedValue({ id: 'rev1', productId: 'prod1', status: 'PUBLISHED' });

    await service.moderate('rev1', { status: 'PUBLISHED' });

    expect(events.publish).toHaveBeenCalledWith(DomainEvent.ReviewModerated, {
      reviewId: 'rev1',
      productId: 'prod1',
      status: 'PUBLISHED',
    });
  });

  it('publishes ReviewModerated for a rejection too — a size-bias recompute must reflect a review no longer counting', async () => {
    prisma.review.findUnique.mockResolvedValue({ id: 'rev1', productId: 'prod1', staffReply: null });
    prisma.review.update.mockResolvedValue({ id: 'rev1', productId: 'prod1', status: 'REJECTED' });

    await service.moderate('rev1', { status: 'REJECTED' });

    expect(events.publish).toHaveBeenCalledWith(DomainEvent.ReviewModerated, {
      reviewId: 'rev1',
      productId: 'prod1',
      status: 'REJECTED',
    });
  });
});
