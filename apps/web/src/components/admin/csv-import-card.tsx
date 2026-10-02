'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { CsvImportSummary } from '@/types/api';
import { formatNumber } from '@newax/shared';
import { DataTable, SuccessState } from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { CSV_IMPORT_HINT, CSV_IMPORT_RULES } from '@/lib/upload-rules';

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
  /** Where the imported records can be reached afterwards: the success state's one loud button (SUC-2). */
  listHref: string;
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
  listHref,
}: CsvImportCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<CsvImportSummary | null>(null);
  const [wasPreview, setWasPreview] = useState(false);
  // Counts finished runs, so a second import is a new result (and moves focus to it) rather than an edit of the first.
  const [runs, setRuns] = useState(0);
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
      setRuns((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import failed');
    } finally {
      setBusy(null);
    }
  }

  const imported = summary ? summary.created + summary.updated : 0;
  // A committed run with a result on screen: its primary is "View ...", so the form's own Import steps back (PER-9,
  // COL-4: one loud button) and stays off, so a double click cannot write the same rows twice. Choosing another file
  // clears the summary and brings it back.
  const committed = imported > 0 && !wasPreview;

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

          {/* Choosing is not sending: the file goes with Preview or Import below, so there is no tray here (UPL-6 is for a send that starts at once). */}
          <Dropzone
            className="mt-3"
            rules={CSV_IMPORT_RULES}
            hint={CSV_IMPORT_HINT}
            selected={file}
            onFiles={([chosen]) => {
              setFile(chosen ?? null);
              setSummary(null);
            }}
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
              disabled={!file || busy !== null || committed}
              className={committed ? 'btn-secondary' : 'btn-primary'}
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

          {committed ? (
            // Rows other people rely on were written (SUC-3): say how many, of what, and where to find them. The
            // per-row results stay below, so a skipped row is still one click from its reason.
            <div className="border-b border-neutral-100 px-4 py-8">
              <SuccessState
                key={runs}
                focus
                title={`${formatNumber(imported)} ${imported === 1 ? 'row' : 'rows'} imported as ${entityLabel}`}
                detail={`${formatNumber(summary.created)} created · ${formatNumber(summary.updated)} updated · ${formatNumber(summary.skipped)} skipped, out of ${formatNumber(summary.total)} rows`}
                primary={{ label: `View ${entityLabel}`, href: listHref }}
                secondary={{
                  label: 'Import another file',
                  onClick: () => {
                    setFile(null);
                    setSummary(null);
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 border-b border-neutral-100 px-4 py-3 text-sm">
              <Count label="Rows" value={summary.total} />
              <Count label="Created" value={summary.created} tone="good" />
              <Count label="Updated" value={summary.updated} tone="good" />
              <Count label="Skipped" value={summary.skipped} tone={summary.skipped ? 'bad' : undefined} />
            </div>
          )}

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
