'use client';

import { useEffect } from 'react';

/**
 * Registers the app-shell cache-first service worker (public/sw.js) for
 * installability and offline page loads. It caches static assets only —
 * queuing and replaying a failed SALE is `@newax/pos-core`'s outbox state
 * machine plus outbox-db.ts, not the service worker; the two are
 * deliberately separate so an asset-caching bug can never touch a sale.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  return null;
}
