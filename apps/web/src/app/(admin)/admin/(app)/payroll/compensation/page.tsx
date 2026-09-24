'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatMoney, formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, Dialog, EmptyState, PageHeader } from '@/components/ui';
import type { CompensationBasis, CompensationRate, EmployeeCompensation } from '@/types/api';

interface CurrentRateRow extends CompensationRate {
  user: { id: string; firstName: string | null; lastName: string | null; email: string | null };
}

const BASES: CompensationBasis[] = ['MONTHLY', 'HOURLY', 'COMMISSION'];

function displayName(u: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return name || u.email || 'Unknown';
}

/**
 * WO-19.6 (docs/implementation/payroll/19-payroll.md) — every employee's current
 * compensation rate, with a detail dialog for the full rate history and
 * setting a new one.
 */
export default function PayrollCompensationPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [rows, setRows] = useState<CurrentRateRow[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openUser, setOpenUser] = useState<CurrentRateRow | null>(null);
  const [detail, setDetail] = useState<EmployeeCompensation | null>(null);

  const [basis, setBasis] = useState<CompensationBasis>('MONTHLY');
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await adminFetch<CurrentRateRow[]>('/admin/payroll/compensation'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load compensation rates');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(row: CurrentRateRow) {
    setOpenUser(row);
    setDetail(null);
    setBasis(row.basis);
    setAmount(String(row.amountMinor / 100));
    setEffectiveFrom('');
    try {
      setDetail(await adminFetch<EmployeeCompensation>(`/admin/payroll/compensation/${row.userId}`));
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not load rate history', 'error');
    }
  }

  async function setRate(event: React.FormEvent) {
    event.preventDefault();
    if (!openUser || !effectiveFrom) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/payroll/compensation/${openUser.userId}`, {
        method: 'PATCH',
        body: { basis, amountMinor: Math.round(Number(amount) * 100), effectiveFrom },
      });
      addToast('Rate updated.', 'success');
      setOpenUser(null);
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not set the new rate', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              className={cn(
                'w-full cursor-pointer rounded-md border p-4 text-start text-sm shadow-md',
                t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : t.type === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800',
              )}
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label={`Dismiss: ${t.message}`}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}

      <PageHeader title="Compensation" description="Every employee's current wage rate." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {!busy && rows && rows.length === 0 ? (
        <EmptyState title="No compensation rates on file" description="Set a rate from an employee's profile to get started." />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={rows}
            loading={busy && !rows}
            rowKey={(row) => row.id}
            emptyLabel="No compensation rates on file."
            columns={[
              { header: 'Employee', cell: (row) => displayName(row.user) },
              { header: 'Basis', cell: (row) => row.basis, muted: true },
              { header: 'Rate', numeric: true, align: 'end', cell: (row) => formatMoney(row.amountMinor) },
              { header: 'Effective from', muted: true, cell: (row) => formatDate(row.effectiveFrom) },
              {
                header: '',
                align: 'end',
                cell: (row) => (
                  <button type="button" onClick={() => void openDetail(row)} className="text-xs text-neutral-900/60 hover:text-neutral-900">
                    View / edit
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      <Dialog
        open={openUser !== null}
        onClose={() => setOpenUser(null)}
        title={openUser ? displayName(openUser.user) : 'Compensation'}
      >
        {openUser ? (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-medium text-neutral-900">Rate history</h3>
              {detail ? (
                <ul className="space-y-1 text-sm text-neutral-900/70">
                  {detail.history.map((rate) => (
                    <li key={rate.id}>
                      {rate.basis} — {formatMoney(rate.amountMinor)} from {formatDate(rate.effectiveFrom)}
                      {rate.effectiveTo ? ` to ${formatDate(rate.effectiveTo)}` : ' (current)'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-900/60">Loading…</p>
              )}
            </div>

            <form onSubmit={setRate} className="space-y-3 border-t border-neutral-100 pt-4">
              <h3 className="text-sm font-medium text-neutral-900">Set a new rate</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">Basis</span>
                  <select value={basis} onChange={(e) => setBasis(e.target.value as CompensationBasis)} className="field-input">
                    {BASES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="field-label">Amount (Rs)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="field-input"
                    required
                  />
                </label>
                <label className="block col-span-2">
                  <span className="field-label">Effective from</span>
                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="field-input"
                    required
                  />
                </label>
              </div>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Set rate'}
              </button>
            </form>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
