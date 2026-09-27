import { NotFoundException } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { ApiVersionPolicyService } from './api-version-policy.service';
import { DeprecationHeaderInterceptor } from './deprecation-header.interceptor';

function makeConfig(prefix = 'api') {
  return { get: (key: string) => (key === 'API_PREFIX' ? prefix : undefined) } as any;
}

function makeContext(path: string, setHeader: jest.Mock = jest.fn()) {
  const request = { path };
  const response = { setHeader };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as any;
}

describe('DeprecationHeaderInterceptor — WO-37.1', () => {
  it('is a no-op for a route whose version has no registered deprecation — every route today', async () => {
    const policy = new ApiVersionPolicyService();
    const interceptor = new DeprecationHeaderInterceptor(policy, makeConfig());
    const next = { handle: () => of('ok') };
    const setHeader = jest.fn();

    const result$ = interceptor.intercept(makeContext('/api/v1/orders', setHeader), next);

    await expect(firstValueFrom(result$)).resolves.toBe('ok');
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('sets Deprecation and Sunset headers on a response served under a deprecated version', async () => {
    const policy = new ApiVersionPolicyService();
    const since = new Date('2026-01-01T00:00:00Z');
    const sunsetAt = new Date('2027-01-01T00:00:00Z');
    policy.registerDeprecation('1', { since, sunsetAt });

    const interceptor = new DeprecationHeaderInterceptor(policy, makeConfig());
    const next = { handle: () => of('ok') };
    const setHeader = jest.fn();

    const result$ = interceptor.intercept(makeContext('/api/v1/orders', setHeader), next);
    await firstValueFrom(result$);

    expect(setHeader).toHaveBeenCalledWith('Deprecation', since.toUTCString());
    expect(setHeader).toHaveBeenCalledWith('Sunset', sunsetAt.toUTCString());
  });

  it('refuses a request made after the sunset date — the one REQUEST-shaped refusal this document introduces', () => {
    const policy = new ApiVersionPolicyService();
    policy.registerDeprecation('1', { since: new Date('2026-01-01'), sunsetAt: new Date('2020-01-01') });

    const interceptor = new DeprecationHeaderInterceptor(policy, makeConfig());
    const next = { handle: () => of('ok') };

    expect(() => interceptor.intercept(makeContext('/api/v1/orders'), next)).toThrow(NotFoundException);
  });

  it('does not touch a request for a different, non-deprecated version', async () => {
    const policy = new ApiVersionPolicyService();
    policy.registerDeprecation('1', { since: new Date('2026-01-01'), sunsetAt: new Date('2027-01-01') });

    const interceptor = new DeprecationHeaderInterceptor(policy, makeConfig());
    const next = { handle: () => of('ok') };
    const setHeader = jest.fn();

    await firstValueFrom(interceptor.intercept(makeContext('/api/v2/orders', setHeader), next));

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('is a no-op for a path with no version segment', async () => {
    const policy = new ApiVersionPolicyService();
    const interceptor = new DeprecationHeaderInterceptor(policy, makeConfig());
    const next = { handle: () => of('ok') };
    const setHeader = jest.fn();

    await firstValueFrom(interceptor.intercept(makeContext('/api/health', setHeader), next));

    expect(setHeader).not.toHaveBeenCalled();
  });
});
