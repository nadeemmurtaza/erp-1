'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, PageHeader, Dialog, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface SettlementProvider {
  id: string;
  key: string;
  label: string;
  isActive: boolean;
}

interface BatchRow {
  id: string;
  externalBatchRef: string;
  expectedAmountMinor: number;
  settledAmountMinor: number | null;
  status: 'EXPECTED' | 'CONFIRMED' | 'SHORT' | 'DISPUTED';
  createdAt: string;
  provider: SettlementProvider;
}

const STATUS_OPTIONS = ['EXPECTED', 'CONFIRMED', 'SHORT', 'DISPUTED'].map((value) => ({ value, label: value }));

/**
 * finance-accounting/49-financial-institution-settlement-partnerships.md
 * WO-49.6 — what a bank or gateway says it actually paid out, reconciled
 * against what `Payment` already records as owed. Recording an expected
 * batch works with no connector registered (this codebase ships none yet);
 * reconciling one does not, and `reconcile()` says so per-batch.
 */
export default function SettlementsPage() {
  const { can } = useAdminSession();
  const canManage = can('finance.settlement.reconcile');

  const [rows, setRows] = useState<BatchRow[] | null>(null);
  const [providers, setProviders] = useState<SettlementProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [externalBatchRef, setExternalBatchRef] = useState('');
  const [paymentIdsText, setPaymentIdsText] = useState('');
  const statusFilter = useFilterParam('status');

  const load = () => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: BatchRow[] }>('/admin/settlements/batches', { query: { status: statusFilter || undefined } })
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load settlement batches'))
      .finally(() => setBusy(false));
  };

  useEffect(load, [statusFilter]);

  useEffect(() => {
    if (!canManage) return;
    adminFetch<{ data: SettlementProvider[] }>('/admin/settlements/providers')
      .then((res) => setProviders(res.data))
      .catch(() => setProviders([]));
  }, [canManage]);

  const createBatch = async () => {
    const paymentIds = paymentIdsText
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!providerId || !externalBatchRef.trim() || paymentIds.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/settlements/batches', {
        method: 'POST',
        body: { settlementProviderId: providerId, externalBatchRef: externalBatchRef.trim(), paymentIds },
      });
      setNewOpen(false);
      setProviderId('');
      setExternalBatchRef('');
      setPaymentIdsText('');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this expected batch');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Settlements"
        description="What a bank or payment gateway says it actually paid out, reconciled against what we already recorded as owed."
        action={
          canManage ? (
            <button className="btn-primary" onClick={() => setNewOpen(true)}>
              Record expected batch
            </button>
          ) : undefined
        }
      />

      <FilterBar filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]} />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        {rows && rows.length === 0 ? (
          <EmptyState
            title="No settlement batches"
            description="Nothing has been recorded yet, or none match this filter."
            action={
              canManage ? (
                <button className="btn-primary" onClick={() => setNewOpen(true)}>
                  Record expected batch
                </button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            rows={rows}
            loading={busy && !rows}
            emptyLabel="No settlement batches found."
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Batch',
                cell: (r) => (
                  <Link href={ROUTES.admin.settlementBatch(r.id)} className="font-medium text-accent-hover hover:underline">
                    {r.externalBatchRef}
                  </Link>
                ),
              },
              { header: 'Provider', cell: (r) => r.provider.label, muted: true },
              { header: 'Expected', align: 'end', numeric: true, cell: (r) => formatMoney(r.expectedAmountMinor) },
              {
                header: 'Settled',
                align: 'end',
                numeric: true,
                cell: (r) => (r.settledAmountMinor === null ? '—' : formatMoney(r.settledAmountMinor)),
              },
              { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
              { header: 'Recorded', cell: (r) => formatDate(r.createdAt), muted: true },
            ]}
          />
        )}
      </div>

      <Dialog open={newOpen} onClose={saving ? () => {} : () => setNewOpen(false)} title="Record an expected settlement batch">
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Provider</span>
            <select className="field-input w-full" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">Choose a provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Batch reference</span>
            <input
              className="field-input w-full"
              value={externalBatchRef}
              onChange={(e) => setExternalBatchRef(e.target.value)}
              placeholder="The bank or gateway's own batch id"
            />
          </label>
          <label className="block">
            <span className="field-label">Payment ids this batch should cover</span>
            <textarea
              className="field-input w-full"
              rows={3}
              value={paymentIdsText}
              onChange={(e) => setPaymentIdsText(e.target.value)}
              placeholder="Comma-separated payment ids"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={saving} onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={saving || !providerId || !externalBatchRef.trim() || !paymentIdsText.trim()}
            onClick={createBatch}
          >
            Record
          </button>
        </div>
      </Dialog>
    </>
  );
}
