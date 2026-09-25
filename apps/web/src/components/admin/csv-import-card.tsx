'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { CsvImportSummary } from '@/types/api';
import { DataTable } from '@/components/ui';

interface CsvImportCardProps {
  /** e.g. "customers" — used in the heading and the template filename. */
  entityLabel: string;
  templateUrl: string;
  templateFilename: string;
  importUrl: string;
  /** Column header for the row's own identifying value (a phone, a description…). */
  keyLabel: string;
  /** Bullet notes shown next to the template download — the format's own quirks. */
  notes: Array<{ term: string; detail: string }>;
}

/**
 * Shared upload/preview/commit card for the CSV importers
 * (admin-platform/72-fragmented-tool-consolidation-import.md WO-72.4) —
 * matches `/admin/import`'s (catalogue) layout, generalized for the `key`-
 * based `CsvImportSummary` shape `ContactImportService`/`ExpenseImportService`
 * share. Not reused by the catalogue screen itself (SKU-specific results,
 * a working screen with its own tests) — this is a new home for the two new
 * importers, not a refactor of an existing one.
 */
export function CsvImportCard({
  entityLabel,
  templateUrl,
  templateFilename,
  importUrl,
  keyLabel,
  notes,
}: CsvImportCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [wasPreview, setWasPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);

  async function downloadTemplate() {
    setError(null);
    try {
      const csv = await adminFetch<string>(templateUrl, { expect: 'text' });
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = templateFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the template');
    }
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    setError(null);
    setBusy(dryRun ? 'preview' : 'commit');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await adminFetch<CsvImportSummary>(importUrl, {
        method: 'POST',
        formData,
        query: { dryRun: dryRun ? 'true' : undefined },
      });
      setSummary(result);
      setWasPreview(dryRun);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="grid gap-6 fold:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">1. Start from the template</h2>
          <p className="mt-1 text-sm text-neutral-900/60">
            It carries the exact column names and one filled-in example row.
          </p>
          <button type="button" onClick={() => void downloadTemplate()} className="btn-secondary mt-3">
            Download CSV template
          </button>

          {notes.length > 0 ? (
            <dl className="mt-5 space-y-2 border-t border-neutral-100 pt-4 text-xs text-neutral-900/60">
              {notes.map((note) => (
                <div key={note.term}>
                  <dt className="font-medium text-neutral-900/80">{note.term}</dt>
                  <dd>{note.detail}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">2. Preview, then import</h2>
          <p className="mt-1 text-sm text-neutral-900/60">
            Preview validates every row and changes nothing. Import commits it.
          </p>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setSummary(null);
            }}
            className="mt-3 block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-accent-hover file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accent-hover"
          />

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void run(true)}
              disabled={!file || busy !== null}
              className="btn-secondary"
            >
              {busy === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
            <button
              type="button"
              onClick={() => void run(false)}
              disabled={!file || busy !== null}
              className="btn-primary"
            >
              {busy === 'commit' ? 'Importing…' : `Import ${entityLabel}`}
            </button>
          </div>

          {error ? (
            <p role="alert" className="notice notice-error mt-4">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {summary ? (
        <section className="card mt-6">
          {wasPreview ? (
            <p className="notice notice-info m-4">
              Preview only — nothing was saved. Click &ldquo;Import {entityLabel}&rdquo; to commit these rows.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-6 border-b border-neutral-100 px-4 py-3 text-sm">
            <Count label="Rows" value={summary.total} />
            <Count label="Created" value={summary.created} tone="good" />
            <Count label="Updated" value={summary.updated} tone="good" />
            <Count label="Skipped" value={summary.skipped} tone={summary.skipped ? 'bad' : undefined} />
          </div>

          <DataTable
            rows={summary.results}
            rowKey={(result) => `${result.row}-${result.key}`}
            columns={[
              { header: 'Row', muted: true, numeric: true, cell: (result) => result.row },
              {
                header: keyLabel,
                cell: (result) => <span className="text-neutral-900">{result.key || '—'}</span>,
              },
              {
                header: 'Result',
                cell: (result) => (
                  <>
                    <span
                      className={result.action === 'skipped' ? 'font-medium text-red-700' : 'text-accent-hover'}
                    >
                      {result.action}
                    </span>
                    {result.message ? <span className="text-neutral-900/60"> — {result.message}</span> : null}
                  </>
                ),
              },
            ]}
          />
        </section>
      ) : null}
    </>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-xs text-neutral-900/60">{label}</p>
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
