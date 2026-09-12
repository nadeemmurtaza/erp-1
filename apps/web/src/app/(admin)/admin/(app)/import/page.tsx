'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { ImportSummary } from '@/types/api';
import { exportFilename } from '@/constants/downloads';

/**
 * Bulk catalogue upload.
 *
 * One CSV row is one variant; rows sharing a name and category fold into a
 * single product with several variants, which is how a real stock list is
 * written. A bad row is reported with its line number and skipped — the rest of
 * the file still imports, so a 500-row spreadsheet is not lost to one typo.
 */
export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function downloadTemplate() {
    setError(null);
    try {
      const csv = await adminFetch<string>('/admin/catalog/import/template', {
        expect: 'text',
      });

      // The API sets a download header, but the admin fetches with a bearer
      // token, so the file is turned into a download here instead.
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exportFilename('products-template');
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the template');
    }
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    setError(null);
    setSummary(null);
    setBusy(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      setSummary(await adminFetch<ImportSummary>('/admin/catalog/import', { method: 'POST', formData }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Bulk import</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Load an existing stock list from a spreadsheet. Re-uploading the same file updates
        the rows it already created, so a weekly stock file is safe to run repeatedly.
      </p>

      <div className="grid gap-6 fold:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">1. Start from the template</h2>
          <p className="mt-1 text-sm text-neutral-900/60">
            It carries the exact column names and one filled-in example row.
          </p>
          <button type="button" onClick={() => void downloadTemplate()} className="btn-secondary mt-3">
            Download CSV template
          </button>

          <dl className="mt-5 space-y-2 border-t border-neutral-100 pt-4 text-xs text-neutral-900/60">
            <div>
              <dt className="font-medium text-neutral-900/80">Prices in rupees</dt>
              <dd>Write 4500, not 450000. Commas are fine.</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-900/80">One row per variant</dt>
              <dd>Same name and category means the same product, different variant.</dd>
            </div>
            <div>
              <dt className="font-medium text-neutral-900/80">SKU is the key</dt>
              <dd>An existing SKU updates its variant instead of creating a duplicate.</dd>
            </div>
          </dl>
        </div>

        <form onSubmit={upload} className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">2. Upload the file</h2>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-accent-hover file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accent-hover"
          />

          <button type="submit" disabled={!file || busy} className="btn-primary mt-4">
            {busy ? 'Importing…' : 'Import products'}
          </button>

          {error ? (
            <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      </div>

      {summary ? (
        <section className="card mt-6">
          <div className="flex flex-wrap gap-6 border-b border-neutral-100 px-4 py-3 text-sm">
            <Count label="Rows" value={summary.total} />
            <Count label="Created" value={summary.created} tone="good" />
            <Count label="Updated" value={summary.updated} tone="good" />
            <Count label="Skipped" value={summary.skipped} tone={summary.skipped ? 'bad' : undefined} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                    Row
                  </th>
                  <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                    SKU
                  </th>
                  <th className="px-4 py-2 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white">
                {summary.results.map((result) => (
                  <tr key={`${result.row}-${result.sku}`}>
                    <td className="px-4 py-2 tabular-nums text-neutral-900/50">{result.row}</td>
                    <td className="px-4 py-2 font-mono text-xs text-neutral-900">{result.sku || '—'}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          result.action === 'skipped'
                            ? 'font-medium text-red-700'
                            : 'text-accent-hover'
                        }
                      >
                        {result.action}
                      </span>
                      {result.message ? (
                        <span className="text-neutral-900/60"> — {result.message}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'bad';
}) {
  return (
    <div>
      <p className="text-xs text-neutral-900/50">{label}</p>
      <p
        className={
          tone === 'bad'
            ? 'text-lg font-semibold text-red-700'
            : tone === 'good'
              ? 'text-lg font-semibold text-accent-hover'
              : 'text-lg font-semibold text-neutral-900'
        }
      >
        {value}
      </p>
    </div>
  );
}
