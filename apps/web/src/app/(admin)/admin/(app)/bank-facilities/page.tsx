'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate, toMinor } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { DataTable, EmptyState, FilterBar, PageHeader, Dialog, MetricStrip, useFilterParam } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { useAdminSession } from '@/components/admin/session';

interface Bank {
  id: string;
  name: string;
  isActive: boolean;
}

type FacilityType = 'TERM_LOAN' | 'RUNNING_FINANCE' | 'OVERDRAFT' | 'LETTER_OF_CREDIT' | 'BANK_GUARANTEE';

interface FacilityRow {
  id: string;
  key: string;
  label: string;
  facilityType: FacilityType;
  limitMinor: number;
  utilizedMinor: number;
  markupRateBps: number;
  maturityDate: string;
  status: 'ACTIVE' | 'CLOSED';
  bank: Bank;
}

const STATUS_OPTIONS = ['ACTIVE', 'CLOSED'].map((value) => ({ value, label: value }));
const FACILITY_TYPES: { value: FacilityType; label: string }[] = [
  { value: 'TERM_LOAN', label: 'Term loan' },
  { value: 'RUNNING_FINANCE', label: 'Running finance' },
  { value: 'OVERDRAFT', label: 'Overdraft' },
  { value: 'LETTER_OF_CREDIT', label: 'Letter of credit' },
  { value: 'BANK_GUARANTEE', label: 'Bank guarantee' },
];

/**
 * finance-accounting/167-bank-facility-management.md WO-167.6 — the
 * business's own borrowing against a bank facility limit: term loans,
 * running finance, overdrafts, and letter-of-credit/bank-guarantee limits.
 * Utilization is computed server-side (BankFacilitiesService.utilizationOf),
 * never a stored counter this screen could show stale.
 */
export default function BankFacilitiesPage() {
  const { can } = useAdminSession();
  const canManage = can('finance.facilities.manage');

  const [rows, setRows] = useState<FacilityRow[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const statusFilter = useFilterParam('status');

  const [newBankMode, setNewBankMode] = useState(false);
  const [bankId, setBankId] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [facilityType, setFacilityType] = useState<FacilityType>('RUNNING_FINANCE');
  const [limitRupees, setLimitRupees] = useState('');
  const [markupRateBps, setMarkupRateBps] = useState('');
  const [isFloatingRate, setIsFloatingRate] = useState(false);
  const [securityReference, setSecurityReference] = useState('');
  const [startDate, setStartDate] = useState('');
  const [maturityDate, setMaturityDate] = useState('');

  const load = () => {
    setBusy(true);
    setError(null);
    adminFetch<{ data: FacilityRow[] }>('/admin/bank-facilities', { query: { status: statusFilter || undefined } })
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load bank facilities'))
      .finally(() => setBusy(false));
  };

  useEffect(load, [statusFilter]);

  useEffect(() => {
    if (!canManage) return;
    adminFetch<{ data: Bank[] }>('/admin/bank-facilities/banks')
      .then((res) => setBanks(res.data))
      .catch(() => setBanks([]));
  }, [canManage]);

  const resetForm = () => {
    setNewBankMode(false);
    setBankId('');
    setNewBankName('');
    setKey('');
    setLabel('');
    setFacilityType('RUNNING_FINANCE');
    setLimitRupees('');
    setMarkupRateBps('');
    setIsFloatingRate(false);
    setSecurityReference('');
    setStartDate('');
    setMaturityDate('');
  };

  const createFacility = async () => {
    if (!key.trim() || !label.trim() || !limitRupees || !markupRateBps || !startDate || !maturityDate) return;
    if (!newBankMode && !bankId) return;
    if (newBankMode && !newBankName.trim()) return;

    setSaving(true);
    setError(null);
    try {
      let resolvedBankId = bankId;
      if (newBankMode) {
        const bank = await adminFetch<Bank>('/admin/bank-facilities/banks', { method: 'POST', body: { name: newBankName.trim() } });
        resolvedBankId = bank.id;
      }

      await adminFetch('/admin/bank-facilities', {
        method: 'POST',
        body: {
          bankId: resolvedBankId,
          key: key.trim(),
          label: label.trim(),
          facilityType,
          limitMinor: toMinor(Number(limitRupees) || 0),
          markupRateBps: parseInt(markupRateBps, 10) || 0,
          isFloatingRate,
          securityReference: securityReference.trim() || undefined,
          startDate,
          maturityDate,
        },
      });
      setNewOpen(false);
      resetForm();
      load();
      adminFetch<{ data: Bank[] }>('/admin/bank-facilities/banks')
        .then((res) => setBanks(res.data))
        .catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register this bank facility');
    } finally {
      setSaving(false);
    }
  };

  const totalLimit = rows?.reduce((sum, r) => sum + r.limitMinor, 0) ?? 0;
  const totalUtilized = rows?.reduce((sum, r) => sum + r.utilizedMinor, 0) ?? 0;
  const activeCount = rows?.filter((r) => r.status === 'ACTIVE').length ?? 0;

  return (
    <>
      <PageHeader
        title="Bank Facilities"
        description="The business's own borrowing against a bank facility limit — term loans, running finance, overdrafts, and letter-of-credit/bank-guarantee limits."
        action={
          canManage ? (
            <button className="btn-primary" onClick={() => setNewOpen(true)}>
              Register facility
            </button>
          ) : undefined
        }
      />

      {rows && rows.length > 0 ? (
        <MetricStrip
          label="Borrowing summary"
          className="mb-6"
          items={[
            { key: 'limit', label: 'Total limit', value: formatMoney(totalLimit) },
            { key: 'utilized', label: 'Total utilized', value: formatMoney(totalUtilized) },
            { key: 'active', label: 'Active facilities', value: String(activeCount) },
          ]}
        />
      ) : null}

      <FilterBar filters={[{ key: 'status', type: 'select', placeholder: 'All statuses', options: STATUS_OPTIONS }]} />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden">
        {rows && rows.length === 0 ? (
          <EmptyState
            title="No bank facilities"
            description="Nothing has been registered yet, or none match this filter."
            action={
              canManage ? (
                <button className="btn-primary" onClick={() => setNewOpen(true)}>
                  Register facility
                </button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            rows={rows}
            loading={busy && !rows}
            emptyLabel="No bank facilities found."
            rowKey={(r) => r.id}
            columns={[
              {
                header: 'Facility',
                cell: (r) => (
                  <Link href={ROUTES.admin.bankFacility(r.id)} className="font-medium text-accent-hover hover:underline">
                    {r.label}
                  </Link>
                ),
              },
              { header: 'Bank', cell: (r) => r.bank.name, muted: true },
              { header: 'Type', cell: (r) => FACILITY_TYPES.find((t) => t.value === r.facilityType)?.label ?? r.facilityType },
              { header: 'Limit', align: 'end', numeric: true, cell: (r) => formatMoney(r.limitMinor) },
              { header: 'Utilized', align: 'end', numeric: true, cell: (r) => formatMoney(r.utilizedMinor) },
              { header: 'Maturity', cell: (r) => formatDate(r.maturityDate), muted: true },
              { header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
            ]}
          />
        )}
      </div>

      <Dialog
        open={newOpen}
        onClose={saving ? () => {} : () => setNewOpen(false)}
        title="Register a bank facility"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Bank</span>
            {newBankMode ? (
              <input
                className="field-input w-full"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                placeholder="Bank name"
              />
            ) : (
              <select className="field-input w-full" value={bankId} onChange={(e) => setBankId(e.target.value)}>
                <option value="">Choose a bank…</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <button type="button" className="btn-text mt-1 text-xs" onClick={() => setNewBankMode((v) => !v)}>
              {newBankMode ? 'Choose an existing bank instead' : '+ Register a new bank'}
            </button>
          </label>
          <label className="block">
            <span className="field-label">Key</span>
            <input
              className="field-input w-full"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="hbl-running-finance-01"
            />
          </label>
          <label className="block">
            <span className="field-label">Label</span>
            <input className="field-input w-full" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="field-label">Facility type</span>
            <select className="field-input w-full" value={facilityType} onChange={(e) => setFacilityType(e.target.value as FacilityType)}>
              {FACILITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Limit</span>
              <input
                className="field-input w-full"
                type="number"
                min="0"
                value={limitRupees}
                onChange={(e) => setLimitRupees(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Markup rate (bps)</span>
              <input
                className="field-input w-full"
                type="number"
                min="0"
                value={markupRateBps}
                onChange={(e) => setMarkupRateBps(e.target.value)}
                placeholder="2200 = 22.00%"
              />
            </label>
          </div>
          <label className="field-check">
            <input type="checkbox" checked={isFloatingRate} onChange={(e) => setIsFloatingRate(e.target.checked)} />
            <span>Floating rate</span>
          </label>
          <label className="block">
            <span className="field-label">Security / collateral reference</span>
            <input
              className="field-input w-full"
              value={securityReference}
              onChange={(e) => setSecurityReference(e.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Start date</span>
              <input className="field-input w-full" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="field-label">Maturity date</span>
              <input className="field-input w-full" type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" disabled={saving} onClick={() => setNewOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={
              saving ||
              !key.trim() ||
              !label.trim() ||
              !limitRupees ||
              !markupRateBps ||
              !startDate ||
              !maturityDate ||
              (newBankMode ? !newBankName.trim() : !bankId)
            }
            onClick={createFacility}
          >
            Register
          </button>
        </div>
      </Dialog>
    </>
  );
}
