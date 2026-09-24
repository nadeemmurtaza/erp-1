'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, ConfirmDialog, Tabs, Badge } from '@/components/ui';
import { formatDateTime } from '@newax/shared';
import type { AdminRedirect, SeoHealthRow } from '@/types/api';

/** Catalogue -> SEO & redirects (WO-3.7/3.9, 03-variants-sku-seo.md). */
export default function SeoPage() {
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">SEO & redirects</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        The publish-gate backlog, and every URL that now 301s somewhere else.
      </p>

      <Tabs
        label="SEO sections"
        items={[
          { key: 'health', label: 'Health', content: <SeoHealthTab /> },
          { key: 'redirects', label: 'Redirects', content: <RedirectsTab /> },
        ]}
      />
    </>
  );
}

function SeoHealthTab() {
  const [rows, setRows] = useState<SeoHealthRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<SeoHealthRow[]>('/admin/catalog/products/seo-health')
      .then(setRows)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Could not load the SEO health list');
        setRows([]);
      });
  }, []);

  return (
    <div className="pt-4">
      {error ? <p className="notice notice-error mb-4">{error}</p> : null}
      <DataTable
        rows={rows}
        loading={rows === null}
        rowKey={(row) => row.id}
        emptyLabel="Every product passes the publish gate."
        columns={[
          {
            header: 'Product',
            cell: (row) => (
              <Link href={`/admin/products/${row.id}`} className="font-medium text-accent-hover hover:underline">
                {row.name}
              </Link>
            ),
          },
          { header: 'Status', cell: (row) => <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{row.status}</Badge> },
          {
            header: 'Missing',
            cell: (row) => (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-neutral-900/70">
                {row.failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </div>
  );
}

interface RedirectDraft {
  fromPath: string;
  toPath: string;
}

const BLANK: RedirectDraft = { fromPath: '', toPath: '' };

function RedirectsTab() {
  const [redirects, setRedirects] = useState<AdminRedirect[] | null>(null);
  const [draft, setDraft] = useState<RedirectDraft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AdminRedirect | null>(null);

  const load = useCallback(async () => {
    try {
      setRedirects(await adminFetch<AdminRedirect[]>('/admin/catalog/redirects'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load redirects');
      setRedirects([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminFetch('/admin/catalog/redirects', {
        method: 'POST',
        body: { fromPath: draft.fromPath.trim(), toPath: draft.toPath.trim() },
      });
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this redirect');
    } finally {
      setBusy(false);
    }
  }

  async function remove(redirect: AdminRedirect) {
    setError(null);
    try {
      await adminFetch(`/admin/catalog/redirects/${redirect.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this redirect');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="pt-4">
      {error ? <p className="notice notice-error mb-4 whitespace-pre-line">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="overflow-hidden">
          <DataTable
            rows={redirects}
            loading={redirects === null}
            rowKey={(redirect) => redirect.id}
            emptyLabel="No redirects yet."
            columns={[
              { header: 'From', cell: (redirect) => redirect.fromPath, className: 'font-medium' },
              { header: 'To', muted: true, cell: (redirect) => redirect.toPath },
              { header: 'Kind', muted: true, cell: (redirect) => (redirect.isAutomatic ? 'Automatic' : 'Manual') },
              { header: 'Hits', align: 'end', numeric: true, muted: true, cell: (redirect) => redirect.hitCount },
              { header: 'Created', muted: true, cell: (redirect) => formatDateTime(redirect.createdAt) },
              {
                header: '',
                align: 'end',
                cell: (redirect) => (
                  <button
                    type="button"
                    onClick={() => setDeleting(redirect)}
                    className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  >
                    Delete
                  </button>
                ),
              },
            ]}
          />
        </div>

        <form onSubmit={save} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Add a redirect</h2>
          <label className="block">
            <span className="field-label">
              From<span className="text-red-600"> *</span>
            </span>
            <input
              value={draft.fromPath}
              onChange={(event) => setDraft({ ...draft, fromPath: event.target.value })}
              required
              placeholder="/product/old-slug"
              className="field-input"
            />
          </label>
          <label className="block">
            <span className="field-label">
              To<span className="text-red-600"> *</span>
            </span>
            <input
              value={draft.toPath}
              onChange={(event) => setDraft({ ...draft, toPath: event.target.value })}
              required
              placeholder="/product/new-slug"
              className="field-input"
            />
          </label>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Add redirect'}
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) return remove(deleting);
        }}
        title="Delete this redirect?"
        description={
          deleting
            ? `"${deleting.fromPath}" will 404 again instead of forwarding to "${deleting.toPath}".`
            : ''
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
