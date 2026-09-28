import { Logger } from '@nestjs/common';
import { REDIS_BOOT_READY_WAIT_MS, REDIS_CLIENT_OPTIONS, RedisService, redisReconnectDelayMs } from './redis.service';

/**
 * The failure half of the Redis primitive, against an address nothing
 * listens on — so it needs no Redis. The connected half (real commands, the
 * token bucket, two replicas sharing counters) is test/auth-throttle.e2e-spec.ts's.
 */
describe('RedisService with Redis unreachable (doc 206 §1.2, ADR-075 addendum)', () => {
  let service: RedisService;
  let logged: string[];

  beforeEach(() => {
    logged = [];
    const capture = (message: unknown) => {
      logged.push(String(message));
    };
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(capture);
    // Port 1: refused at once, and the URL carries a password that must never be logged.
    service = new RedisService({ get: () => 'redis://:s3cret-password@127.0.0.1:1' } as any);
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.restoreAllMocks();
  });

  it('pins the fail-fast client options, and reconnects forever with a backoff capped at 2 s', () => {
    expect(REDIS_CLIENT_OPTIONS).toEqual({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      autoResendUnfulfilledCommands: false,
      commandTimeout: 500,
      connectTimeout: 2_000,
    });
    expect([1, 10, 40, 41, 1_000].map(redisReconnectDelayMs)).toEqual([50, 500, 2_000, 2_000, 2_000]);
  });

  it('opens nothing until onModuleInit — a factory may ask for the client first', () => {
    expect(service.client('rateLimit').status).toBe('wait');
    expect(service.client('rateLimit')).toBe(service.client('rateLimit'));
  });

  it('puts the rateLimit keyspace on database 0, whatever the URL', () => {
    expect(service.client('rateLimit').options.db).toBe(0);
  });

  it('boots anyway after the bounded wait — Redis is never a boot dependency', async () => {
    const started = Date.now();
    await service.onModuleInit();
    const waited = Date.now() - started;

    expect(waited).toBeGreaterThanOrEqual(REDIS_BOOT_READY_WAIT_MS - 50);
    expect(waited).toBeLessThan(REDIS_BOOT_READY_WAIT_MS + 1_500);
    expect(service.isReady('rateLimit')).toBe(false);
    expect(logged.some((line) => /not ready after 2000 ms/.test(line))).toBe(true);
  });

  it('answers a command at once while down, never parks it until the connection returns', async () => {
    await service.onModuleInit();

    const started = Date.now();
    await expect(service.client('rateLimit').eval('return 1', 0)).rejects.toThrow(/enableOfflineQueue/);
    expect(Date.now() - started).toBeLessThan(100);
    await expect(service.ping('rateLimit')).resolves.toEqual({ ok: false, detail: expect.stringContaining('enableOfflineQueue') });
  });

  it('reports the outage once, by address — never the password in REDIS_URL', async () => {
    await service.onModuleInit();

    const unreachable = logged.filter((line) => line.includes('unreachable'));
    expect(unreachable).toHaveLength(1);
    expect(unreachable[0]).toContain('127.0.0.1:1');
    expect(logged.join('\n')).not.toContain('s3cret-password');
  });
});
