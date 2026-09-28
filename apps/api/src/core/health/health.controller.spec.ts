import { HealthController } from './health.controller';

describe('HealthController — 38-resilience-engineering.md WO-38.1, degradation matrix row "Postgres (primary)"', () => {
  it('/health stays ok even when the database is unreachable — liveness never depends on Postgres', () => {
    const controller = new HealthController({} as any);
    expect(controller.live().status).toBe('ok');
  });

  it('/health/ready reports degraded, with checks.database.ok false, when Postgres is unreachable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')), outboxEvent: { count: jest.fn() } };
    const controller = new HealthController(prisma as any);

    const result = await controller.ready();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.ok).toBe(false);
    expect(result.checks.database.detail).toContain('connection refused');
    // The doc's own "no degraded mode" claim for this one row: outbox
    // counts are reported as unknown (-1), never a stale or fabricated number.
    expect(result.outbox).toEqual({ pendingEvents: -1, failedEvents: -1 });
    expect(prisma.outboxEvent.count).not.toHaveBeenCalled();
  });

  it('/health/ready reports ok, with real outbox counts, when the database is reachable', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      outboxEvent: { count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0) },
    };
    const controller = new HealthController(prisma as any);

    const result = await controller.ready();

    expect(result.status).toBe('ok');
    expect(result.checks.database.ok).toBe(true);
    expect(result.outbox).toEqual({ pendingEvents: 2, failedEvents: 0 });
  });
});
