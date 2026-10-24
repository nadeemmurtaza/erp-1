import { HttpStatus, Logger } from '@nestjs/common';
import { GLOBAL_THROTTLE } from './global-throttle';
import { RATE_LIMIT_STORE_UNAVAILABLE_MESSAGE, SharedThrottlerStorage } from './shared-throttler-storage';

/**
 * WO-206.1 (206-rate-limiting-caching-compression-hardening.md §1.2), and the
 * degradation-matrix row it adds to 38-resilience-engineering.md §1: what a
 * request gets when the shared Redis store cannot answer. The Redis adapter
 * itself, and two replicas sharing its counters, run against a real Redis in
 * test/auth-throttle.e2e-spec.ts.
 */
describe('SharedThrottlerStorage', () => {
  const record = { totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 };
  const CREDENTIAL = { ttl: 60_000, limit: 10 };

  let shared: { increment: jest.Mock };
  let storage: SharedThrottlerStorage;
  let errors: jest.SpyInstance;
  let logs: jest.SpyInstance;

  beforeEach(() => {
    shared = { increment: jest.fn().mockResolvedValue(record) };
    storage = new SharedThrottlerStorage(shared, [GLOBAL_THROTTLE]);
    errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    storage.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('keeps the module-wide limit at 300 per 60 s — WO-206.1 moved its counters, not its value', () => {
    expect(GLOBAL_THROTTLE).toEqual({ name: 'default', ttl: 60_000, limit: 300 });
  });

  it('counts in the shared store while it answers', async () => {
    await expect(storage.increment('key', CREDENTIAL.ttl, CREDENTIAL.limit, CREDENTIAL.ttl, 'default')).resolves.toEqual(record);
    expect(shared.increment).toHaveBeenCalledWith('key', 60_000, 10, 60_000, 'default');
  });

  it('fails CLOSED (503) on a route that declared its own limit — a credential guess is never unlimited', async () => {
    shared.increment.mockRejectedValue(new Error('Command timed out'));

    const refusal = storage.increment('login-key', CREDENTIAL.ttl, CREDENTIAL.limit, CREDENTIAL.ttl, 'default');

    await expect(refusal).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE, message: RATE_LIMIT_STORE_UNAVAILABLE_MESSAGE });
  });

  it('a route whose own limit differs only in ttl also declared its own', async () => {
    shared.increment.mockRejectedValue(new Error('down'));

    await expect(storage.increment('k', 1_000, GLOBAL_THROTTLE.limit, 1_000, 'default')).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });

  it('keeps a route on the module-wide limit serving, counted per process — a Redis outage is never an outage of every route', async () => {
    shared.increment.mockRejectedValue(new Error('down'));

    const first = await storage.increment('browse-key', GLOBAL_THROTTLE.ttl, GLOBAL_THROTTLE.limit, GLOBAL_THROTTLE.ttl, 'default');
    const second = await storage.increment('browse-key', GLOBAL_THROTTLE.ttl, GLOBAL_THROTTLE.limit, GLOBAL_THROTTLE.ttl, 'default');

    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(second).toMatchObject({ totalHits: 2, isBlocked: false });
  });

  it('the per-process fallback still limits — degraded, never unlimited', async () => {
    shared.increment.mockRejectedValue(new Error('down'));
    const tight = new SharedThrottlerStorage(shared, [{ name: 'default', ttl: 60_000, limit: 2 }]);

    const hits = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hits.push(await tight.increment('k', 60_000, 2, 60_000, 'default'));
    }

    expect(hits.map((hit) => hit.isBlocked)).toEqual([false, false, true]);
    tight.onApplicationShutdown();
  });

  it('treats a throttler name it was never told about as declared — the safe side', async () => {
    shared.increment.mockRejectedValue(new Error('down'));

    await expect(storage.increment('k', 60_000, 300, 60_000, 'burst')).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
  });

  it('logs an outage once when it starts and once when it ends, not once per request', async () => {
    shared.increment.mockRejectedValue(new Error('down'));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await storage.increment('k', GLOBAL_THROTTLE.ttl, GLOBAL_THROTTLE.limit, GLOBAL_THROTTLE.ttl, 'default');
    }
    shared.increment.mockResolvedValue(record);
    await storage.increment('k', GLOBAL_THROTTLE.ttl, GLOBAL_THROTTLE.limit, GLOBAL_THROTTLE.ttl, 'default');
    await storage.increment('k', GLOBAL_THROTTLE.ttl, GLOBAL_THROTTLE.limit, GLOBAL_THROTTLE.ttl, 'default');

    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls[0][0]).toMatch(/Shared rate-limit store unavailable \(down\)/);
    expect(logs).toHaveBeenCalledTimes(1);
    expect(logs.mock.calls[0][0]).toMatch(/recovered/);
  });
});
