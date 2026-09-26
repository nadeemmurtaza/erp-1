'use client';

import { markFailed, markSyncing, pendingEntries, type OutboxEntry } from '@newax/pos-core';
import { deleteOutboxEntry, listOutboxEntries, putOutboxEntry } from './outbox-db';
import { sell, type PosSaleRequest } from './pos-client';
import { ApiError } from './api-client';

/**
 * Tries to sync every PENDING outbox entry against the API, one at a time
 * — sequential rather than parallel, so two queued sales for the same
 * variant post their stock deductions in the order they actually happened
 * at the till. A synced entry is deleted outright: its real Order now
 * exists server-side, and this app keeps no separate synced-sale history
 * (that's the Order itself). A FAILED one stays, with its error, for the
 * next retry.
 */
export async function syncOutbox(shiftId: string): Promise<{ synced: number; failed: number }> {
  const entries = pendingEntries(await listOutboxEntries());
  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    const syncing = markSyncing(entry as OutboxEntry<PosSaleRequest>);
    await putOutboxEntry(syncing);

    try {
      // architecture-patterns/157 — the outbox entry's own id IS this sale's
      // Idempotency-Key (assigned once, in till/page.tsx, at the moment the
      // sale was first attempted): resending it unchanged on every sync
      // retry means a sale already recorded server-side replays instead of
      // posting a second stock decrement.
      await sell(shiftId, syncing.payload, syncing.id);
      await deleteOutboxEntry(syncing.id);
      synced += 1;
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'Network error';
      await putOutboxEntry(markFailed(syncing, message));
      failed += 1;
    }
  }

  return { synced, failed };
}
