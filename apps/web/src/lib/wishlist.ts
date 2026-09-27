'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useCustomerSession } from '@/components/storefront/customer-session';
import { customerFetch } from '@/lib/customer-client';
import { STORAGE_KEYS } from '@/constants/storage';

/**
 * Phase 7 WO-7.6: the wishlist moved server-side
 * (`docs/implementation/customer-portal-loyalty/07-customer-portal.md`).
 * Signed-out browsing still uses this exact localStorage store it always
 * has — a shopper can save items before creating an account — and the
 * moment a session appears, `useWishlist()` migrates whatever was saved
 * (`POST /wishlist/migrate`) and clears local storage, then reads/writes the
 * server from then on. Every consumer (`ProductCard`'s heart button,
 * `BottomNav`'s badge, the wishlist page) keeps calling the exact same
 * `useWishlist()` shape as before — only what backs it changed.
 */

const STORAGE_KEY = STORAGE_KEYS.wishlist;

// --- local (signed-out) store — unchanged from the original implementation ---

let localIds: string[] = [];
let localHydrated = false;
const localListeners = new Set<() => void>();

function readLocalStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function hydrateLocal(): void {
  if (localHydrated || typeof window === 'undefined') return;
  localHydrated = true;
  localIds = readLocalStorage();
}

function notifyLocal(): void {
  for (const listener of localListeners) listener();
}

function subscribeLocal(listener: () => void): () => void {
  hydrateLocal();
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

function getLocalSnapshot(): string[] {
  hydrateLocal();
  return localIds;
}

function getServerSnapshotForLocal(): string[] {
  return localIds;
}

export function toggleWishlist(productId: string): void {
  hydrateLocal();
  localIds = localIds.includes(productId) ? localIds.filter((id) => id !== productId) : [...localIds, productId];

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(localIds));
  } catch {
    // Storage can be unavailable (private browsing, quota) — in-memory
    // state still updates so the UI stays correct for this page load.
  }

  notifyLocal();
}

function clearLocalWishlist(): void {
  localIds = [];
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — nothing else depends on the key actually being gone.
  }
  notifyLocal();
}

// --- server (signed-in) store ---

interface ServerItem {
  id: string;
  productId: string;
}

let serverItems: ServerItem[] | null = null;
let serverLoadedForUserId: string | null = null;
let migratedForUserId: string | null = null;
const serverListeners = new Set<() => void>();

function notifyServer(): void {
  for (const listener of serverListeners) listener();
}

function subscribeServer(listener: () => void): () => void {
  serverListeners.add(listener);
  return () => serverListeners.delete(listener);
}

// `useSyncExternalStore` requires a snapshot getter to return the same
// reference until the underlying data actually changes — `.map()` on every
// call handed it a fresh array each time, which React's dev-mode check
// (correctly) treats as an infinite loop. Cache the derived array and only
// recompute it when `serverItems` itself has changed.
let serverIdsCache: string[] = [];
let serverIdsCacheSource: ServerItem[] | null = null;

function getServerIdsSnapshot(): string[] {
  if (serverItems !== serverIdsCacheSource) {
    serverIdsCacheSource = serverItems;
    serverIdsCache = serverItems ? serverItems.map((item) => item.productId) : [];
  }
  return serverIdsCache;
}

async function ensureServerWishlist(userId: string): Promise<void> {
  if (serverLoadedForUserId === userId) return;

  // First load for this signed-in session: migrate whatever the browser had
  // saved before this sign-in, then clear it, per WO-7.6's own words.
  if (migratedForUserId !== userId) {
    migratedForUserId = userId;
    hydrateLocal();
    if (localIds.length > 0) {
      try {
        await customerFetch('/wishlist/migrate', { method: 'POST', body: { productIds: localIds } });
      } catch {
        // A failed migration leaves localStorage untouched — the next sign-in
        // (or a page refresh) tries again rather than silently losing it.
        migratedForUserId = null;
      }
      if (migratedForUserId === userId) clearLocalWishlist();
    }
  }

  const items = await customerFetch<Array<{ id: string; productId: string }>>('/wishlist');
  serverItems = items.map((item) => ({ id: item.id, productId: item.productId }));
  serverLoadedForUserId = userId;
  notifyServer();
}

async function toggleServerWishlist(userId: string, productId: string): Promise<void> {
  const existing = serverItems?.find((item) => item.productId === productId);
  if (existing) {
    serverItems = serverItems!.filter((item) => item.id !== existing.id);
    notifyServer();
    await customerFetch(`/wishlist/${existing.id}`, { method: 'DELETE' }).catch(() => {
      // Best-effort revert on failure — the next load re-syncs regardless.
      ensureServerWishlist(userId);
    });
    return;
  }

  const created = await customerFetch<{ id: string; productId: string }>('/wishlist', {
    method: 'POST',
    body: { productId },
  });
  serverItems = [...(serverItems ?? []), { id: created.id, productId: created.productId }];
  notifyServer();
}

export interface WishlistState {
  ids: string[];
  isSaved: (productId: string) => boolean;
  toggle: (productId: string) => void;
  count: number;
}

export function useWishlist(): WishlistState {
  const { user } = useCustomerSession();

  const localSnapshot = useSyncExternalStore(subscribeLocal, getLocalSnapshot, getServerSnapshotForLocal);
  const serverSnapshot = useSyncExternalStore(subscribeServer, getServerIdsSnapshot, getServerIdsSnapshot);

  useEffect(() => {
    if (user) ensureServerWishlist(user.id).catch(() => undefined);
  }, [user]);

  if (user) {
    return {
      ids: serverSnapshot,
      isSaved: (productId) => serverSnapshot.includes(productId),
      toggle: (productId) => {
        toggleServerWishlist(user.id, productId).catch(() => undefined);
      },
      count: serverSnapshot.length,
    };
  }

  return {
    ids: localSnapshot,
    isSaved: (productId) => localSnapshot.includes(productId),
    toggle: toggleWishlist,
    count: localSnapshot.length,
  };
}
