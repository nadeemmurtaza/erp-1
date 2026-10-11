import {
  PRIVATE_CACHE_CONTROL,
  PUBLIC_CACHE_CONTROL,
  PUBLIC_FOLDERS,
  UNGATED_FOLDERS,
  cacheControlFor,
  folderOf,
  visibilityOf,
} from './storage-visibility';

/** ADR-091 — who may fetch a stored object by URL, decided by its folder; private unless named. */
describe('storage visibility', () => {
  it('names exactly the folders that are public by design', () => {
    expect([...PUBLIC_FOLDERS].sort()).toEqual(['auction-lots', 'products']);
  });

  // This list only shrinks. Growing it means a new sensitive folder served by
  // bare URL — a change that has to fail here and be argued in review.
  it('names exactly the four ungated folders, and no more', () => {
    expect([...UNGATED_FOLDERS].sort()).toEqual(['payment-receipts', 'receipts', 'return-photos', 'stitching-jobs']);
  });

  it.each([
    ['products/2026/10/a.webp', 'public'],
    ['auction-lots/2026/10/a.webp', 'public'],
    ['payment-receipts/2026/10/a.webp', 'ungated'],
    ['receipts/2026/10/a.pdf', 'ungated'],
    ['return-photos/2026/10/a.webp', 'ungated'],
    ['stitching-jobs/2026/10/a.webp', 'ungated'],
    ['visual-search/2026/10/a.webp', 'private'],
    ['rag-ocr/2026/10/a.webp', 'private'],
    ['rag-sources/2026/10/a.pdf', 'private'],
    ['documents/2026/10/a.pdf', 'private'],
    ['misc/2026/10/a.bin', 'private'],
    ['', 'private'],
  ])('%s is %s', (key, expected) => {
    expect(visibilityOf(key)).toBe(expected);
  });

  it('judges the folder case-insensitively, so a case-insensitive filesystem cannot reopen a folder', () => {
    expect(folderOf('RAG-SOURCES/2026/10/a.pdf')).toBe('rag-sources');
    expect(visibilityOf('Products/2026/10/a.webp')).toBe('public');
  });

  it('caches only a public object, as immutable', () => {
    expect(cacheControlFor('public')).toBe(PUBLIC_CACHE_CONTROL);
    expect(PUBLIC_CACHE_CONTROL).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('ungated')).toBe(PRIVATE_CACHE_CONTROL);
    expect(cacheControlFor('private')).toBe(PRIVATE_CACHE_CONTROL);
    expect(PRIVATE_CACHE_CONTROL).toBe('private, no-store');
  });
});
