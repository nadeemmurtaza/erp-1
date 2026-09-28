import { ApiError, requestWithRefresh, singleFlight } from './http-client';

/** Resolves when told to — so a test can hold a refresh "in flight" while other 401s arrive. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight — at most one refresh in flight per tab (206-rate-limiting-caching-compression-hardening.md §2.2, WO-206.4)', () => {
  it('every call made while a run is pending shares that run', async () => {
    const pending = deferred<boolean>();
    const task = jest.fn(() => pending.promise);
    const refresh = singleFlight(task);

    const waiters = [refresh(), refresh(), refresh(), refresh(), refresh()];
    pending.resolve(true);

    await expect(Promise.all(waiters)).resolves.toEqual([true, true, true, true, true]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('the first call after a run settles starts a fresh one', async () => {
    const task = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const refresh = singleFlight(task);

    await expect(refresh()).resolves.toBe('first');
    await expect(refresh()).resolves.toBe('second');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('a failed run is shared too, and never wedges the next call', async () => {
    const task = jest.fn().mockRejectedValueOnce(new TypeError('network down')).mockResolvedValueOnce(true);
    const refresh = singleFlight(task);

    const results = await Promise.allSettled([refresh(), refresh()]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(task).toHaveBeenCalledTimes(1);

    await expect(refresh()).resolves.toBe(true);
  });
});

describe('requestWithRefresh + singleFlight — five simultaneous 401s send one /auth/refresh', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('each request waits on the one refresh and retries with its token', async () => {
    let token = 'expired-access';
    const pending = deferred<boolean>();
    const refreshCalls = jest.fn(() => pending.promise);
    const refresh = singleFlight(refreshCalls);

    global.fetch = jest.fn(async (_url: unknown, init?: RequestInit) => {
      const authorization = (init?.headers as Record<string, string>).Authorization;
      return authorization === 'Bearer fresh-access'
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
    }) as typeof fetch;

    const auth = { token: () => token, refresh, onExpired: jest.fn(), expiredMessage: 'Session expired' };
    const calls = Array.from({ length: 5 }, (_, index) => requestWithRefresh('https://api.test', `/thing/${index}`, {}, auth));

    // Let all five 401s arrive while the refresh is still outstanding.
    await new Promise((resolve) => setTimeout(resolve, 20));
    token = 'fresh-access';
    pending.resolve(true);

    await expect(Promise.all(calls)).resolves.toEqual(Array(5).fill({ ok: true }));
    expect(refreshCalls).toHaveBeenCalledTimes(1);
    expect(auth.onExpired).not.toHaveBeenCalled();
  });

  it('when the one refresh fails, every waiting request signs out with the same message', async () => {
    const refresh = singleFlight(jest.fn(async (): Promise<boolean> => false));
    global.fetch = jest.fn(async () => new Response('{}', { status: 401 })) as typeof fetch;
    const auth = { token: () => 'expired', refresh, onExpired: jest.fn(), expiredMessage: 'Session expired' };

    const results = await Promise.allSettled([1, 2, 3].map((n) => requestWithRefresh('https://api.test', `/x/${n}`, {}, auth)));

    expect(results.every((result) => result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 401)).toBe(true);
  });
});
