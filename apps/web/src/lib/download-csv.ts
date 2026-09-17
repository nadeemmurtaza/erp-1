import { adminFetch } from '@/lib/admin-client';

/**
 * Pull a CSV from an admin endpoint and hand it to the browser.
 *
 * The API authenticates with a bearer token rather than a cookie, so a plain
 * `<a href>` to an export route cannot carry auth — the file has to be
 * fetched and turned into an object URL. That dance was written out twice,
 * on Reports and on Customers, and the two had already diverged: one asked
 * for text and built the Blob itself, the other took `response.blob()` and
 * threw a bare `new Error('Export failed')` that replaced whatever the API
 * had said was wrong.
 *
 * Throws whatever the client throws, so the caller shows one message the
 * same way it shows every other failure.
 */
export async function downloadCsv(
  path: string,
  filename: string,
  query?: Record<string, unknown>,
): Promise<void> {
  const csv = await adminFetch<string>(path, { query, expect: 'text' });
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    // Revoked even if the click throws, or the blob leaks for the life of
    // the tab — and an admin exporting a morning's reports does this a lot.
    URL.revokeObjectURL(url);
  }
}
