/**
 * The offline sale outbox — a pure state machine, no I/O (RETAIL-ERP.md's
 * own `packages/pos-core` description). apps/pos owns the actual IndexedDB
 * persistence and the fetch that tries to sync a queued sale; this file
 * only says which transitions are valid and what an entry looks like after
 * one, so that logic is unit-testable without a browser.
 *
 *   PENDING --sync--> SYNCING --ok----> SYNCED   (terminal)
 *                         \---fail----> FAILED --retry--> PENDING
 *
 * A sale that already happened at the till must never be silently dropped
 * (RETAIL-ERP.md R5's spirit applied to the outbox itself) — FAILED is
 * always retryable, never a dead end, and nothing here ever deletes an
 * entry except an explicit call once it is SYNCED.
 */
export type OutboxStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface OutboxEntry<TPayload> {
  id: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  payload: TPayload;
  lastError: string | null;
  /** The Order id the API returned once this entry synced — null until then. */
  syncedOrderId: string | null;
}

export class InvalidOutboxTransitionError extends Error {
  constructor(from: OutboxStatus, action: string) {
    super(`Cannot ${action} an outbox entry in status ${from}.`);
    this.name = 'InvalidOutboxTransitionError';
  }
}

export function createOutboxEntry<TPayload>(
  id: string,
  payload: TPayload,
  now: Date = new Date(),
): OutboxEntry<TPayload> {
  return {
    id,
    createdAt: now.toISOString(),
    status: 'PENDING',
    attempts: 0,
    payload,
    lastError: null,
    syncedOrderId: null,
  };
}

export function markSyncing<TPayload>(entry: OutboxEntry<TPayload>): OutboxEntry<TPayload> {
  if (entry.status !== 'PENDING' && entry.status !== 'FAILED') {
    throw new InvalidOutboxTransitionError(entry.status, 'sync');
  }
  return { ...entry, status: 'SYNCING', attempts: entry.attempts + 1 };
}

export function markSynced<TPayload>(entry: OutboxEntry<TPayload>, orderId: string): OutboxEntry<TPayload> {
  if (entry.status !== 'SYNCING') {
    throw new InvalidOutboxTransitionError(entry.status, 'complete');
  }
  return { ...entry, status: 'SYNCED', syncedOrderId: orderId, lastError: null };
}

export function markFailed<TPayload>(entry: OutboxEntry<TPayload>, error: string): OutboxEntry<TPayload> {
  if (entry.status !== 'SYNCING') {
    throw new InvalidOutboxTransitionError(entry.status, 'fail');
  }
  return { ...entry, status: 'FAILED', lastError: error };
}

/** Clears a FAILED entry back to PENDING so the next sync pass picks it up again. */
export function retry<TPayload>(entry: OutboxEntry<TPayload>): OutboxEntry<TPayload> {
  if (entry.status !== 'FAILED') {
    throw new InvalidOutboxTransitionError(entry.status, 'retry');
  }
  return { ...entry, status: 'PENDING' };
}

export function pendingEntries<TPayload>(entries: ReadonlyArray<OutboxEntry<TPayload>>): OutboxEntry<TPayload>[] {
  return entries.filter((e) => e.status === 'PENDING');
}
