import { Controller, HttpStatus, Post, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Throttle, ThrottlerException } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { CREDENTIAL_THROTTLE } from '../auth/auth.controller';
import { AuditRateLimit } from '../auth/decorators';
import { loginIdentifierHash } from '../auth/login-identifier';
import { AppThrottlerGuard } from './app-throttler.guard';
import { GLOBAL_THROTTLE } from './global-throttle';

@Controller('auth')
class CredentialRoutes {
  @Throttle(CREDENTIAL_THROTTLE)
  @AuditRateLimit('identifier')
  @Post('login')
  login() {}

  @Throttle(CREDENTIAL_THROTTLE)
  @Post('forgot-password')
  forgotPassword() {}
}

describe('AppThrottlerGuard — per-IP 429s on credential routes become auth.rate_limited (doc 206 §1.2)', () => {
  const BLOCKED = { totalHits: 11, timeToExpire: 40, isBlocked: true, timeToBlockExpire: 42 };

  let storage: { increment: jest.Mock };
  let audit: { recordRefusal: jest.Mock };
  let guard: AppThrottlerGuard;
  let response: { header: jest.Mock };

  function contextFor(handler: 'login' | 'forgotPassword', body: unknown): ExecutionContext {
    const request = { ip: '198.51.100.4', method: 'POST', body, headers: {} };
    return {
      getHandler: () => CredentialRoutes.prototype[handler],
      getClass: () => CredentialRoutes,
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ExecutionContext;
  }

  beforeEach(async () => {
    storage = { increment: jest.fn().mockResolvedValue(BLOCKED) };
    audit = { recordRefusal: jest.fn().mockResolvedValue(undefined) };
    response = { header: jest.fn() };
    guard = new AppThrottlerGuard({ throttlers: [GLOBAL_THROTTLE] }, storage, new Reflector(), audit as any);
    await guard.onModuleInit();
  });

  it('still throttles exactly as ThrottlerGuard does: 429 with its Retry-After, at the route\'s own limit', async () => {
    const refusal = guard.canActivate(contextFor('login', { identifier: 'ayesha@example.com', password: 'hunter22' }));

    await expect(refusal).rejects.toBeInstanceOf(ThrottlerException);
    await expect(refusal).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(storage.increment).toHaveBeenCalledWith(expect.any(String), 60_000, 10, 60_000, 'default');
    expect(response.header).toHaveBeenCalledWith('Retry-After', 42);
  });

  it('records the refusal with the hashed identifier and source IP — the password never reaches the audit trail', async () => {
    await guard.canActivate(contextFor('login', { identifier: 'Ayesha@Example.com', password: 'hunter22' })).catch(() => undefined);

    const throttlerKey = createHash('sha256').update('CredentialRoutes-login-default-198.51.100.4').digest('hex');
    expect(audit.recordRefusal).toHaveBeenCalledWith({
      layer: 'ip',
      route: 'POST /auth/login',
      identifierHash: loginIdentifierHash('ayesha@example.com'),
      ip: '198.51.100.4',
      retryAfterSeconds: 42,
      episodeKey: throttlerKey,
      episodeMs: 42_000,
    });
    const recorded = JSON.stringify(audit.recordRefusal.mock.calls);
    expect(recorded).not.toContain('hunter22');
    expect(recorded).not.toContain('ayesha');
  });

  it('still records an unvalidated body with no usable identifier — the guard runs before validation', async () => {
    await guard.canActivate(contextFor('login', { identifier: ['not', 'a', 'string'] })).catch(() => undefined);
    await guard.canActivate(contextFor('login', undefined)).catch(() => undefined);

    expect(audit.recordRefusal).toHaveBeenCalledTimes(2);
    expect(audit.recordRefusal.mock.calls.map(([refusal]) => refusal.identifierHash)).toEqual([null, null]);
  });

  it('leaves a credential route without @AuditRateLimit throttled but unaudited', async () => {
    await expect(guard.canActivate(contextFor('forgotPassword', { email: 'ayesha@example.com' }))).rejects.toBeInstanceOf(ThrottlerException);

    expect(audit.recordRefusal).not.toHaveBeenCalled();
  });

  it('records nothing for a request that is under the limit', async () => {
    storage.increment.mockResolvedValue({ totalHits: 3, timeToExpire: 40, isBlocked: false, timeToBlockExpire: 0 });

    await expect(guard.canActivate(contextFor('login', { identifier: 'ayesha@example.com' }))).resolves.toBe(true);
    expect(audit.recordRefusal).not.toHaveBeenCalled();
  });
});
