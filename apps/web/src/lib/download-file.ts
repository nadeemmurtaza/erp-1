import { adminFetch } from '@/lib/admin-client';

/**
 * Pull a binary file (a PDF, here — H2/L20's own RAG source download) from
 * an admin endpoint and hand it to the browser, the same object-URL dance
 * `download-csv.ts` already uses for CSV — the API authenticates with a
 * bearer token, so a plain `<a href>` cannot carry auth and the file has to
 * be fetched first.
 */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await adminFetch<Blob>(path, { expect: 'blob' });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
