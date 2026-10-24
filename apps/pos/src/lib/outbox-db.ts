'use client';

import type { OutboxEntry } from '@newax/pos-core';
import type { PosSaleRequest } from './pos-client';
import { OUTBOX_DB_NAME, OUTBOX_STORE_NAME } from '@/constants/storage';

/**
 * The only file in this app that touches IndexedDB. `@newax/pos-core`'s
 * outbox state machine is pure — this is the thin, real-I/O layer around
 * it: persist an entry, list them, delete a SYNCED one. No background sync
 * registration (the Service Worker Background Sync API has patchy browser
 * support and needs a live worker lifecycle this app doesn't manage yet) —
 * a queued sale is retried by an explicit "Retry sync" action or the next
 * time this app is open with a connection, not automatically in the
 * background. That gap is WO-21.5's, named rather than faked.
 */
type PosOutboxEntry = OutboxEntry<PosSaleRequest>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(OUTBOX_STORE_NAME, mode);
      const req = fn(tx.objectStore(OUTBOX_STORE_NAME));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function putOutboxEntry(entry: PosOutboxEntry): Promise<void> {
  await withStore('readwrite', (store) => store.put(entry));
}

export async function listOutboxEntries(): Promise<PosOutboxEntry[]> {
  return withStore('readonly', (store) => store.getAll());
}

export async function deleteOutboxEntry(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}
