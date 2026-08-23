'use client';

import { useSyncExternalStore } from 'react';

/**
 * Client-only "saved items" wishlist, persisted to this browser's
 * localStorage. There is no server-side wishlist model for this store (no
 * Prisma model backs it), so this is a per-browser convenience only — it
 * does not sync across devices or accounts, and is lost if the customer
 * clears site data or switches browsers.
 *
 * State is held in a module-level store (mirroring how CartProvider keeps
 * one live cart for the whole storefront) rather than React context, so any
 * component can call useWishlist() directly — heart buttons on a product
 * card and a saved-items page both read the same ids and stay in sync
 * without needing a provider wrapped around the tree.
 */

const STORAGE_KEY = 'yaseen_wishlist_ids';

let ids: string[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// Runs once, on first subscribe/read in the browser. Before this, `ids`
// stays `[]` — which is also what the server snapshot always returns, so
// hydration has nothing to reconcile until this fires.
function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  ids = readStorage();
}

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string[] {
  hydrate();
  return ids;
}

// Always `[]` — there is no window to read on the server, and this must
// return a stable reference across calls for useSyncExternalStore.
function getServerSnapshot(): string[] {
  return ids;
}

export function toggleWishlist(productId: string): void {
  hydrate();
  ids = ids.includes(productId) ? ids.filter((id) => id !== productId) : [...ids, productId];

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private browsing, quota) — in-memory
    // state still updates so the UI stays correct for this page load.
  }

  notify();
}

export interface WishlistState {
  ids: string[];
  isSaved: (productId: string) => boolean;
  toggle: (productId: string) => void;
  count: number;
}

export function useWishlist(): WishlistState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    ids: snapshot,
    isSaved: (productId) => snapshot.includes(productId),
    toggle: toggleWishlist,
    count: snapshot.length,
  };
}
