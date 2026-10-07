import { Test, TestingModule } from '@nestjs/testing';
import { ReviewSummaryListener } from './review-summary.listener';
import { ReviewSummaryService } from './review-summary.service';

describe('ReviewSummaryListener', () => {
  let listener: ReviewSummaryListener;
  let summaries: any;

  beforeEach(async () => {
    summaries = { maybeRegenerate: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewSummaryListener, { provide: ReviewSummaryService, useValue: summaries }],
    }).compile();

    listener = module.get(ReviewSummaryListener);
  });

  it('checks the threshold when a review is published', async () => {
    await listener.onReviewModerated({ reviewId: 'r1', productId: 'p1', status: 'PUBLISHED' });
    expect(summaries.maybeRegenerate).toHaveBeenCalledWith('p1');
  });

  it('never checks for a rejected review — it cannot grow the published count', async () => {
    await listener.onReviewModerated({ reviewId: 'r1', productId: 'p1', status: 'REJECTED' });
    expect(summaries.maybeRegenerate).not.toHaveBeenCalled();
  });

  it('never throws when the underlying service fails', async () => {
    summaries.maybeRegenerate.mockRejectedValue(new Error('db unavailable'));
    await expect(
      listener.onReviewModerated({ reviewId: 'r1', productId: 'p1', status: 'PUBLISHED' }),
    ).resolves.toBeUndefined();
  });
});
