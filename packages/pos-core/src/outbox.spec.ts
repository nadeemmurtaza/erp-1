import {
  createOutboxEntry,
  InvalidOutboxTransitionError,
  markFailed,
  markSynced,
  markSyncing,
  pendingEntries,
  retry,
} from './outbox';

describe('outbox state machine', () => {
  it('creates a PENDING entry with zero attempts', () => {
    const entry = createOutboxEntry('e1', { total: 100 }, new Date('2026-01-01T00:00:00.000Z'));
    expect(entry).toEqual({
      id: 'e1',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'PENDING',
      attempts: 0,
      payload: { total: 100 },
      lastError: null,
      syncedOrderId: null,
    });
  });

  it('walks PENDING -> SYNCING -> SYNCED on the happy path', () => {
    const created = createOutboxEntry('e1', {});
    const syncing = markSyncing(created);
    expect(syncing.status).toBe('SYNCING');
    expect(syncing.attempts).toBe(1);

    const synced = markSynced(syncing, 'order-1');
    expect(synced.status).toBe('SYNCED');
    expect(synced.syncedOrderId).toBe('order-1');
  });

  it('walks SYNCING -> FAILED -> PENDING (retry) -> SYNCING again, attempts accumulating', () => {
    let entry = markSyncing(createOutboxEntry('e1', {}));
    entry = markFailed(entry, 'network down');
    expect(entry.status).toBe('FAILED');
    expect(entry.lastError).toBe('network down');

    entry = retry(entry);
    expect(entry.status).toBe('PENDING');

    entry = markSyncing(entry);
    expect(entry.status).toBe('SYNCING');
    expect(entry.attempts).toBe(2);
  });

  it('refuses to complete or fail an entry that is not SYNCING', () => {
    const pending = createOutboxEntry('e1', {});
    expect(() => markSynced(pending, 'order-1')).toThrow(InvalidOutboxTransitionError);
    expect(() => markFailed(pending, 'x')).toThrow(InvalidOutboxTransitionError);
  });

  it('refuses to sync a SYNCED entry, and refuses to retry anything but FAILED', () => {
    const synced = markSynced(markSyncing(createOutboxEntry('e1', {})), 'order-1');
    expect(() => markSyncing(synced)).toThrow(InvalidOutboxTransitionError);
    expect(() => retry(synced)).toThrow(InvalidOutboxTransitionError);
  });

  it('pendingEntries filters to PENDING only', () => {
    const a = createOutboxEntry('a', {});
    const b = markSyncing(createOutboxEntry('b', {}));
    const c = markSynced(markSyncing(createOutboxEntry('c', {})), 'order-3');

    expect(pendingEntries([a, b, c])).toEqual([a]);
  });
});
