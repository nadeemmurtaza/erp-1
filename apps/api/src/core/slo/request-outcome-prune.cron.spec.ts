import { RequestOutcomePruneCron } from './request-outcome-prune.cron';

describe('RequestOutcomePruneCron — WO-38.3', () => {
  it('deletes RequestOutcome rows older than the retention window', async () => {
    const prisma = { requestOutcome: { deleteMany: jest.fn().mockResolvedValue({ count: 7 }) } };
    const cron = new RequestOutcomePruneCron(prisma as any);

    await cron.prune();

    expect(prisma.requestOutcome.deleteMany).toHaveBeenCalledTimes(1);
    const arg = prisma.requestOutcome.deleteMany.mock.calls[0][0];
    const cutoff: Date = arg.where.occurredAt.lt;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    // 30-day SLO window + 5-day buffer.
    expect(daysAgo).toBeCloseTo(35, 0);
  });
});
