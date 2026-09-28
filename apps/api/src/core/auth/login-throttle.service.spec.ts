import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { loginIdentifierHash } from './login-identifier';
import {
  CONSUME_LOGIN_TOKEN_LUA,
  LOGIN_ATTEMPT_BUCKET,
  LoginRateLimitedException,
  LoginThrottleService,
  loginBucketKey,
} from './login-throttle.service';

/**
 * WO-206.2's control flow around the bucket, with Redis stubbed. The Lua
 * bucket itself — capacity, refill schedule, reset — runs against a real
 * Redis in test/auth-throttle.e2e-spec.ts.
 */
describe('LoginThrottleService (doc 206 §1.2)', () => {
  let client: { eval: jest.Mock; del: jest.Mock };
  let audit: { recordRefusal: jest.Mock };
  let service: LoginThrottleService;

  beforeEach(() => {
    client = { eval: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    audit = { recordRefusal: jest.fn().mockResolvedValue(undefined) };
    const redis = { client: jest.fn().mockReturnValue(client) };
    service = new LoginThrottleService(redis as any, audit as any);
  });

  it('keeps doc 206\'s exact parameters: 5 tokens, one back every 300 000 ms', () => {
    expect(LOGIN_ATTEMPT_BUCKET).toEqual({ capacity: 5, refillIntervalMs: 300_000 });
  });

  it('asks the script for one token under the hashed identifier — never the plaintext', async () => {
    client.eval.mockResolvedValue([1, 0]);

    await service.consume('  Ayesha@Example.com ');

    expect(client.eval).toHaveBeenCalledWith(
      CONSUME_LOGIN_TOKEN_LUA,
      1,
      `auth:login-bucket:${loginIdentifierHash('ayesha@example.com')}`,
      5,
      300_000,
    );
    expect(JSON.stringify(client.eval.mock.calls)).not.toContain('ayesha');
    expect(audit.recordRefusal).not.toHaveBeenCalled();
  });

  it('refuses with doc 206\'s 429: { retryAfterSeconds, message }, retryAfterSeconds from the bucket\'s own next refill', async () => {
    client.eval.mockResolvedValue([0, 287_001]);

    const refusal = await service.consume('ayesha@example.com').catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(LoginRateLimitedException);
    const exception = refusal as LoginRateLimitedException;
    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    // 287.001 s rounds UP: retrying at 287 s would be refused again.
    expect(exception.getResponse()).toEqual({ retryAfterSeconds: 288, message: 'Too many attempts. Try again in 288 seconds.' });
  });

  it('never tells a client to retry in 0 seconds', async () => {
    client.eval.mockResolvedValue([0, 1]);

    await expect(service.consume('ayesha@example.com')).rejects.toMatchObject({ retryAfterSeconds: 1 });
  });

  it('audits the refusal with the hashed identifier and source IP, as the account layer', async () => {
    client.eval.mockResolvedValue([0, 150_000]);
    const hash = loginIdentifierHash('ayesha@example.com');

    await expect(service.consume('ayesha@example.com', { ip: '203.0.113.9' })).rejects.toBeInstanceOf(LoginRateLimitedException);

    expect(audit.recordRefusal).toHaveBeenCalledWith({
      layer: 'account',
      route: 'POST /auth/login',
      identifierHash: hash,
      ip: '203.0.113.9',
      retryAfterSeconds: 150,
      episodeKey: hash,
      episodeMs: 300_000,
    });
  });

  it('fails closed with 503 when Redis cannot answer — and records nothing, since nothing was refused for being over a limit', async () => {
    client.eval.mockRejectedValue(new Error("Stream isn't writeable and enableOfflineQueue options is false"));

    const failure = service.consume('ayesha@example.com');

    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(failure).rejects.toMatchObject({ message: expect.stringMatching(/temporarily unavailable/) });
    expect(audit.recordRefusal).not.toHaveBeenCalled();
  });

  it('a Redis command timeout fails closed the same way', async () => {
    client.eval.mockRejectedValue(new Error('Command timed out'));

    await expect(service.consume('ayesha@example.com')).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
  });

  it('reset deletes the bucket — a missing bucket is a full one', async () => {
    await service.reset('Ayesha@Example.com');

    expect(client.del).toHaveBeenCalledWith(loginBucketKey('ayesha@example.com'));
  });

  it('reset is best-effort: a proven sign-in is never refused because a counter could not be cleared', async () => {
    client.del.mockRejectedValue(new Error('Command timed out'));

    await expect(service.reset('ayesha@example.com')).resolves.toBeUndefined();
  });
});
