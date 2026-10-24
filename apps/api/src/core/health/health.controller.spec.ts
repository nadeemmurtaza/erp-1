import { HealthController } from './health.controller';

const redisUp = () => ({ ping: jest.fn().mockResolvedValue({ ok: true }) });

describe('HealthController — 38-resilience-engineering.md WO-38.1, degradation matrix row "Postgres (primary)"', () => {
  it('/health stays ok even when the database is unreachable — liveness never depends on Postgres', () => {
    const controller = new HealthController({} as any, {} as any);
    expect(controller.live().status).toBe('ok');
  });

  it('/health/ready reports degraded, with checks.database.ok false, when Postgres is unreachable', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('connection refused')), outboxEvent: { count: jest.fn() } };
    const controller = new HealthController(prisma as any, redisUp() as any);

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
    const controller = new HealthController(prisma as any, redisUp() as any);

    const result = await controller.ready();

    expect(result.status).toBe('ok');
    expect(result.checks.database.ok).toBe(true);
    expect(result.checks.redis.ok).toBe(true);
    expect(result.outbox).toEqual({ pendingEvents: 2, failedEvents: 0 });
  });
});

describe('HealthController — degradation matrix row "Redis (rate limiting)", 206-rate-limiting-caching-compression-hardening.md', () => {
  it('/health/ready reports degraded with checks.redis.ok false while the database stays ok — sign-in is down, the API is not', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      outboxEvent: { count: jest.fn().mockResolvedValue(0) },
    };
    const redis = { ping: jest.fn().mockResolvedValue({ ok: false, detail: "Stream isn't writeable and enableOfflineQueue options is false" }) };
    const controller = new HealthController(prisma as any, redis as any);

    const result = await controller.ready();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.ok).toBe(true);
    expect(result.checks.redis).toEqual({ ok: false, detail: expect.stringContaining('enableOfflineQueue') });
    expect(redis.ping).toHaveBeenCalledWith('rateLimit');
  });

  it('/health (liveness) never consults Redis', () => {
    const redis = { ping: jest.fn() };
    const controller = new HealthController({} as any, redis as any);

    expect(controller.live().status).toBe('ok');
    expect(redis.ping).not.toHaveBeenCalled();
  });
});
