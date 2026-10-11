/**
 * Who may fetch a stored object by URL, decided by the folder its key starts
 * with (ADR-091). Private is the default: a folder is public only when it is
 * named below, so a new caller's uploads are private until someone decides,
 * here and in review, that they are not.
 *
 * Decided from the key alone, so `FilesController` needs no database read,
 * and the objects already on disk are covered by the same rule.
 */

/** Shown to anyone, by design: product photos on the storefront, auction lots to bidders. */
export const PUBLIC_FOLDERS: ReadonlySet<string> = new Set(['products', 'auction-lots']);

/**
 * Sensitive, and still served to anyone holding the URL, because browsers
 * render them from URLs persisted in `Payment.receiptUrl`, `Expense.receiptUrl`,
 * `ReturnRequest.photoUrls` and `StitchingJobEvent.photoUrl`, and no module
 * hands out an authorised read for them yet. Named debt, never a category to
 * join: this list only shrinks (ADR-091, Consequences). They are already
 * kept out of every shared cache (`PRIVATE_CACHE_CONTROL`).
 */
export const UNGATED_FOLDERS: ReadonlySet<string> = new Set([
  'payment-receipts',
  'receipts',
  'return-photos',
  'stitching-jobs',
]);

/**
 * `public` — served to anyone, cached as immutable.
 * `ungated` — served to anyone holding the URL, never cached by a shared cache.
 * `private` — served only on a signed URL naming this exact key.
 */
export type StoredObjectVisibility = 'public' | 'ungated' | 'private';

/**
 * Keys never change once written (every upload mints a new random key), so a
 * public URL's bytes never change: one year, immutable — the conventional
 * maximum freshness lifetime. ADR-091's parameter table.
 */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * No shared cache (a CDN, a proxy) may keep a copy, and no browser keeps one
 * on disk on a shared back-office PC. The Next.js image optimizer ignores
 * `no-store` and still holds its own copy for `minimumCacheTTL` (60 s by
 * default in Next 15), down from the year the old header allowed.
 */
export const PRIVATE_CACHE_CONTROL = 'private, no-store';

/**
 * The first segment of a key, lower-cased. Stored folders are already lower
 * case (`buildKey()` slugifies them); lower-casing here keeps the rules right
 * on a case-insensitive filesystem too, where `RAG-SOURCES/…` opens `rag-sources/…`.
 */
export function folderOf(key: string): string {
  return key.split('/')[0].toLowerCase();
}

export function visibilityOf(key: string): StoredObjectVisibility {
  const folder = folderOf(key);
  if (PUBLIC_FOLDERS.has(folder)) return 'public';
  if (UNGATED_FOLDERS.has(folder)) return 'ungated';
  return 'private';
}

export function cacheControlFor(visibility: StoredObjectVisibility): string {
  return visibility === 'public' ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL;
}
