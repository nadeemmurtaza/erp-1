import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { of, throwError, firstValueFrom } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotent-write.decorator';

function makeContext(scope: string | undefined, headers: Record<string, string> = {}, body: unknown = {}) {
  const request = {
    header: (name: string) => headers[name],
    body,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({ __scope: scope }),
    getClass: () => ({}),
  } as any;
}

function makeReflector(scope: string | undefined, httpCode?: number) {
  return {
    getAllAndOverride: (key: string) => (key === IDEMPOTENCY_SCOPE_KEY ? scope : undefined),
    get: () => httpCode,
  } as any;
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      ...(overrides.idempotencyKey as Record<string, unknown> | undefined),
    },
  } as any;
}

describe('IdempotencyInterceptor — WO-157.2', () => {
  it('is a no-op for a route with no @IdempotentWrite decorator — no header required', async () => {
    const prisma = makePrisma();
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector(undefined));
    const next = { handle: () => of('unaffected') };

    const result$ = await interceptor.intercept(makeContext(undefined), next);

    await expect(firstValueFrom(result$)).resolves.toBe('unaffected');
    expect(prisma.idempotencyKey.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a guarded route with no Idempotency-Key header', async () => {
    const prisma = makePrisma();
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place'));
    const next = { handle: () => of('never reached') };

    await expect(interceptor.intercept(makeContext('orders.place'), next)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an IN_PROGRESS row, runs the handler once, then marks it COMPLETED with the response cached', async () => {
    const prisma = makePrisma();
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place', 201));
    const next = { handle: jest.fn(() => of({ id: 'order1' })) };

    const result$ = await interceptor.intercept(makeContext('orders.place', { 'Idempotency-Key': 'key1' }), next);
    const result = await firstValueFrom(result$);

    expect(result).toEqual({ id: 'order1' });
    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith({
      data: { scope: 'orders.place', key: 'key1', requestHash: expect.any(String), status: 'IN_PROGRESS' },
    });
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: { scope_key: { scope: 'orders.place', key: 'key1' } },
      data: expect.objectContaining({ status: 'COMPLETED', responseStatus: 201, responseBody: { id: 'order1' } }),
    });
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('replays the cached response for a COMPLETED key with the identical body, never re-invoking the handler', async () => {
    const prisma = makePrisma({
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash: hashOf({ lines: [] }),
          status: 'COMPLETED',
          responseBody: { id: 'order1' },
        }),
      },
    });
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place'));
    const next = { handle: jest.fn(() => of('should not run')) };

    const result$ = await interceptor.intercept(makeContext('orders.place', { 'Idempotency-Key': 'key1' }, { lines: [] }), next);

    await expect(firstValueFrom(result$)).resolves.toEqual({ id: 'order1' });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('refuses the same key resent with a DIFFERENT body, with a 409', async () => {
    const prisma = makePrisma({
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({
          requestHash: hashOf({ lines: [{ sku: 'A' }] }),
          status: 'COMPLETED',
          responseBody: { id: 'order1' },
        }),
      },
    });
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place'));
    const next = { handle: () => of('never reached') };

    await expect(
      interceptor.intercept(makeContext('orders.place', { 'Idempotency-Key': 'key1' }, { lines: [{ sku: 'B' }] }), next),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a key already IN_PROGRESS with the same body — a genuine concurrent duplicate', async () => {
    const prisma = makePrisma({
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({ requestHash: hashOf({}), status: 'IN_PROGRESS', responseBody: null }),
      },
    });
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place'));
    const next = { handle: () => of('never reached') };

    await expect(interceptor.intercept(makeContext('orders.place', { 'Idempotency-Key': 'key1' }), next)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('treats a unique-constraint race on create() as a concurrent duplicate, never a 500', async () => {
    const prisma = makePrisma({
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    });
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place'));
    const next = { handle: () => of('never reached') };

    await expect(interceptor.intercept(makeContext('orders.place', { 'Idempotency-Key': 'key1' }), next)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes the IN_PROGRESS row when the handler throws, so the same key is retryable', async () => {
    const prisma = makePrisma();
    const interceptor = new IdempotencyInterceptor(prisma, makeReflector('orders.place'));
    const failure = new Error('payment declined');
    const next = { handle: () => throwError(() => failure) };

    await expect(interceptor.intercept(makeContext('orders.place', { 'Idempotency-Key': 'key1' }), next)).rejects.toBe(failure);

    expect(prisma.idempotencyKey.delete).toHaveBeenCalledWith({ where: { scope_key: { scope: 'orders.place', key: 'key1' } } });
    expect(prisma.idempotencyKey.update).not.toHaveBeenCalled();
  });
});

function hashOf(body: unknown): string {
  // Mirrors the interceptor's own sha256(JSON.stringify(body)) exactly, so
  // these fixtures represent a real prior request's stored hash.
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}
