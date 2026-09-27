import { SetMetadata } from '@nestjs/common';

/**
 * architecture-patterns/157-client-request-idempotency-keys.md (WO-157.2).
 * Marks a route as guarded by `IdempotencyInterceptor` — opt-in, per route,
 * applied only where a duplicate write is a real financial or stock fact.
 * `scope` is the guard's own namespace, one per guarded route
 * ("orders.place", "pos.sale.create").
 */
export const IDEMPOTENCY_SCOPE_KEY = 'idempotency:scope';

export const IdempotentWrite = (scope: string) => SetMetadata(IDEMPOTENCY_SCOPE_KEY, scope);
