import { IdempotencyCron } from './idempotency.cron';

function makePrisma() {
  return {
    idempotencyKey: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  } as any;
}

describe('IdempotencyCron — WO-157.4', () => {
  it('purges only COMPLETED rows older than 7 days', async () => {
    const prisma = makePrisma();
    const cron = new IdempotencyCron(prisma);

    await cron.purgeExpiredIdempotencyKeys();

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) }, status: 'COMPLETED' },
    });
    const cutoff = prisma.idempotencyKey.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const daysAgo = (Date.now() - cutoff.getTime()) / (24 * 60 * 60 * 1000);
    expect(daysAgo).toBeGreaterThan(6.9);
    expect(daysAgo).toBeLessThan(7.1);
  });

  it('reaps only IN_PROGRESS rows older than 60 minutes, never COMPLETED ones', async () => {
    const prisma = makePrisma();
    const cron = new IdempotencyCron(prisma);

    await cron.reapStuckInProgressKeys();

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) }, status: 'IN_PROGRESS' },
    });
    const cutoff = prisma.idempotencyKey.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const minutesAgo = (Date.now() - cutoff.getTime()) / (60 * 1000);
    expect(minutesAgo).toBeGreaterThan(59);
    expect(minutesAgo).toBeLessThan(61);
  });
});
