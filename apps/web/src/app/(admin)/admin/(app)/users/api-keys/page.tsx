'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatDateTime } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { StatusBadge } from '@/components/common/status-badge';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
  Pagination,
  useFilterPage,
  useFilterParam,
  useSetFilterPage,
} from '@/components/ui';
import type { ApiKeyOversightView, PaginatedResponse } from '@/types/api';

const PAGE_SIZE = 25;

const SURFACE_LABEL = { ADMIN: 'Admin', STOREFRONT: 'Store' } as const;

const REVOKED_BY: Record<string, string> = {
  OWNER: 'by its owner',
  ADMINISTRATOR: 'by an administrator',
  OWNER_DEACTIVATED: 'when its owner was deactivated',
};

/**
 * Every personal API key on this deployment, by staff and customers — read
 * and revoke only (163-personal-api-keys.md §5). Gated by `users.manage`,
 * whose holder can already deactivate an account, which revokes all its
 * keys; revoking one is narrower. Nobody can read a secret here: the server
 * keeps only a fingerprint of each key.
 */
export default function ApiKeysOversightPage() {
  const q = useFilterParam('q');
  const surface = useFilterParam('surface');
  const status = useFilterParam('status');
  const page = useFilterPage();
  const setPage = useSetFilterPage();

  const [keys, setKeys] = useState<PaginatedResponse<ApiKeyOversightView> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyOversightView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setKeys(
        await adminFetch<PaginatedResponse<ApiKeyOversightView>>('/admin/api-keys', {
          query: {
            q: q || undefined,
            surface: surface || undefined,
            status: status || undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load API keys.');
    }
  }, [q, surface, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/api-keys/${revoking.id}/revoke`, { method: 'POST' });
      setRevoking(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not revoke the key.');
    } finally {
      setBusy(false);
    }
  }

  const filtered = Boolean(q || surface || status);

  return (
    <>
      <PageHeader
        title="API keys"
        description="Every key issued on this deployment, by staff and customers. You can revoke any of them; nobody can read a key's secret after it was issued."
      />

      <FilterBar
        filters={[
          { key: 'q', type: 'search', placeholder: 'Search key or owner' },
          {
            key: 'surface',
            type: 'select',
            placeholder: 'Admin and store',
            options: [
              { value: 'ADMIN', label: 'Admin keys' },
              { value: 'STOREFRONT', label: 'Store keys' },
            ],
          },
          {
            key: 'status',
            type: 'select',
            placeholder: 'Any status',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'EXPIRED', label: 'Expired' },
              { value: 'REVOKED', label: 'Revoked' },
            ],
          },
        ]}
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}{' '}
          {keys === null ? (
            <button type="button" className="btn-text" onClick={() => void load()}>
              Try again
            </button>
          ) : null}
        </p>
      ) : null}

      <DataTable
        rows={keys?.data}
        loading={keys === null && !error}
        emptyLabel={filtered ? 'No key matches these filters.' : 'Nobody has created an API key yet.'}
        rowKey={(key) => key.id}
        columns={[
          {
            header: 'Owner',
            cell: (key) => (
              <>
                <span className="font-medium text-neutral-900">
                  {[key.owner.firstName, key.owner.lastName].filter(Boolean).join(' ') ||
                    key.owner.email ||
                    key.owner.phone}
                </span>
                <p className="text-xs text-neutral-900/60">
                  {key.owner.email ?? key.owner.phone}
                  {key.owner.isActive ? '' : ' · deactivated'}
                </p>
              </>
            ),
          },
          {
            header: 'Key',
            cell: (key) => (
              <>
                <span className="text-neutral-900">{key.name}</span>
                <p className="font-mono text-xs text-neutral-900/60" dir="ltr">
                  {key.prefix}…{key.lastFour}
                </p>
              </>
            ),
          },
          { header: 'Surface', cell: (key) => SURFACE_LABEL[key.surface], muted: true },
          {
            header: 'Scopes',
            cell: (key) => (key.surface === 'ADMIN' ? key.permissionKeys : key.customerScopes).length,
            numeric: true,
            align: 'end',
            muted: true,
          },
          {
            header: 'Status',
            cell: (key) => (
              <>
                <StatusBadge status={key.status} />
                {key.revokedReason ? (
                  <p className="mt-1 text-xs text-neutral-900/60">{REVOKED_BY[key.revokedReason]}</p>
                ) : null}
              </>
            ),
          },
          {
            header: 'Last used',
            cell: (key) => (key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Never'),
            muted: true,
          },
          {
            header: 'Expires',
            cell: (key) => (key.status === 'REVOKED' ? '—' : formatDate(key.expiresAt)),
            muted: true,
          },
          {
            header: '',
            align: 'end',
            cell: (key) =>
              key.status === 'REVOKED' ? null : (
                <button
                  type="button"
                  className="btn-text text-xs text-feedback-negative"
                  onClick={() => setRevoking(key)}
                >
                  Revoke
                </button>
              ),
          },
        ]}
      />
      {keys ? <Pagination meta={keys.meta} onChange={setPage} itemLabel="keys" /> : null}

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        busy={busy}
        title={revoking ? `Revoke "${revoking.name}"?` : 'Revoke this key?'}
        description={
          revoking
            ? `It belongs to ${revoking.owner.email ?? revoking.owner.phone ?? 'this account'}. Anything using it is refused from its very next request, and it cannot be undone — the owner can create a new key.`
            : ''
        }
        confirmLabel="Revoke key"
        onConfirm={() => void revoke()}
      />
    </>
  );
}
