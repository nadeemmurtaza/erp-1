'use client';

import { useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import type { ImportAssistanceResult, ImportSummary } from '@/types/api';
import { exportFilename } from '@/constants/downloads';
import { DataTable, Disclosure } from '@/components/ui';
import { Dropzone } from '@/components/ui/dropzone';
import { CSV_IMPORT_HINT, CSV_IMPORT_RULES } from '@/lib/upload-rules';

/**
 * Bulk catalogue upload.
 *
 * One CSV row is one variant; rows sharing a name and category fold into a
 * single product with several variants, which is how a real stock list is
 * written. A bad row is reported with its line number and skipped — the rest of
 * the file still imports, so a 500-row spreadsheet is not lost to one typo.
 *
 * WO-9.10 (09-ai-layer.md) adds two things on top of the existing importer:
 * a preview step (the API already supported `dryRun`, this screen simply
 * exposes it) and an optional AI-assist pass — column-mapping, value
 * cleanup, likely duplicates, category and translation suggestions. Every
 * suggestion is read-only text for a person to act on by editing their
 * spreadsheet; `assist()` never writes anything itself.
 */
export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [wasPreview, setWasPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);

  const [assistance, setAssistance] = useState<ImportAssistanceResult | null>(null);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [assisting, setAssisting] = useState(false);

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

  async function run(dryRun: boolean) {
    if (!file) return;
    setError(null);
    setBusy(dryRun ? 'preview' : 'commit');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await adminFetch<ImportSummary>('/admin/catalog/import', {
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

  async function getAssistance() {
    if (!file) return;
    setAssistError(null);
    setAssisting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      setAssistance(await adminFetch<ImportAssistanceResult>('/admin/catalog/import/assist', { method: 'POST', formData }));
    } catch (cause) {
      setAssistError(cause instanceof Error ? cause.message : 'Could not get AI suggestions');
    } finally {
      setAssisting(false);
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
              setAssistance(null);
              setAssistError(null);
            }}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void getAssistance()}
              disabled={!file || assisting || busy !== null}
              className="btn-text"
            >
              {assisting ? 'Asking the assistant…' : 'Get AI suggestions'}
            </button>
          </div>

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
              {busy === 'commit' ? 'Importing…' : 'Import products'}
            </button>
          </div>

          {error ? (
            <p role="alert" className="notice notice-error mt-4">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {assistError ? (
        <p role="alert" className="notice notice-error mt-6">
          {assistError}
        </p>
      ) : null}

      {assistance ? <AssistancePanel assistance={assistance} /> : null}

      {summary ? (
        <section className="card mt-6">
          {wasPreview ? (
            <p className="notice notice-info m-4">
              Preview only — nothing was saved. Click &ldquo;Import products&rdquo; to commit these rows.
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
            rowKey={(result) => `${result.row}-${result.sku}`}
            columns={[
              {
                header: 'Row',
                muted: true,
                numeric: true,
                cell: (result) => result.row,
              },
              {
                header: 'SKU',
                cell: (result) => (
                  <span className="font-mono text-xs text-neutral-900">{result.sku || '—'}</span>
                ),
              },
              {
                header: 'Result',
                cell: (result) => (
                  <>
                    <span
                      className={
                        result.action === 'skipped' ? 'font-medium text-red-700' : 'text-accent-hover'
                      }
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

function AssistancePanel({ assistance }: { assistance: ImportAssistanceResult }) {
  const nothingToShow =
    assistance.headersAlreadyMatch &&
    assistance.valueSuggestions.length === 0 &&
    assistance.duplicateFlags.length === 0 &&
    assistance.categorySuggestions.length === 0 &&
    assistance.translationSuggestions.length === 0;

  if (nothingToShow) {
    return <p className="notice notice-success mt-6">The file already looks clean — nothing to suggest.</p>;
  }

  return (
    <section className="card mt-6 p-4">
      <h2 className="text-sm font-semibold text-neutral-900">AI suggestions</h2>
      <p className="mt-1 text-sm text-neutral-900/60">
        Nothing here has been saved. Edit your spreadsheet to apply any of these, then preview again.
      </p>

      {!assistance.headersAlreadyMatch ? (
        <Disclosure label={`Column mapping (${assistance.columnMapping.length})`} className="mt-4">
          <ul className="space-y-1 text-sm">
            {assistance.columnMapping.map((entry) => (
              <li key={entry.header} className="flex items-center gap-2">
                <span className="font-mono text-xs text-neutral-900/80">{entry.header}</span>
                <span className="text-neutral-900/60">→</span>
                <span className="font-mono text-xs text-neutral-900">{entry.column ?? '— no match —'}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {assistance.valueSuggestions.length > 0 ? (
        <Disclosure label={`Inconsistent values (${assistance.valueSuggestions.length})`} className="mt-4">
          <ul className="space-y-1 text-sm">
            {assistance.valueSuggestions.map((entry, index) => (
              <li key={`${entry.column}-${entry.raw}-${index}`}>
                <span className="text-neutral-900/60">{entry.column}:</span>{' '}
                <span className="font-mono text-xs text-neutral-900">{entry.raw}</span>
                <span className="text-neutral-900/60"> → </span>
                <span className="font-mono text-xs text-neutral-900">{entry.suggested}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {assistance.duplicateFlags.length > 0 ? (
        <Disclosure label={`Possible duplicates (${assistance.duplicateFlags.length})`} className="mt-4">
          <ul className="space-y-2 text-sm">
            {assistance.duplicateFlags.map((flag, index) => (
              <li key={index}>
                <p className="text-neutral-900">
                  Rows {flag.rows.join(', ')}: {flag.nameEn.join(' / ')}
                </p>
                <p className="text-xs text-neutral-900/60">{flag.reason}</p>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {assistance.categorySuggestions.length > 0 ? (
        <Disclosure label={`Category suggestions (${assistance.categorySuggestions.length})`} className="mt-4">
          <ul className="space-y-1 text-sm">
            {assistance.categorySuggestions.map((entry) => (
              <li key={entry.row}>
                <span className="text-neutral-900/60">Row {entry.row}:</span>{' '}
                <span className="font-mono text-xs text-neutral-900">{entry.suggestedCategorySlug}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      {assistance.translationSuggestions.length > 0 ? (
        <Disclosure label={`Missing translations (${assistance.translationSuggestions.length})`} className="mt-4">
          <ul className="space-y-2 text-sm">
            {assistance.translationSuggestions.map((entry, index) => (
              <li key={`${entry.row}-${entry.field}-${index}`}>
                <p className="text-neutral-900/60">
                  Row {entry.row}, {entry.field}:
                </p>
                <p dir="rtl" className="text-neutral-900">
                  {entry.suggestedText}
                </p>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </section>
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
