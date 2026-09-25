'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney } from '@newax/shared';
import { PageHeader, DataTable, EmptyState } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface ContactOption {
  id: string;
  name: string;
  phoneE164: string | null;
}

interface CreditTerm {
  id: string;
  customerId: string;
  creditLimitMinor: number;
  paymentTermDays: number;
  isOnHold: boolean;
}

export default function CreditTermsPage() {
  const [rows, setRows] = useState<CreditTerm[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [limit, setLimit] = useState('');
  const [termDays, setTermDays] = useState('30');
  const [saving, setSaving] = useState(false);

  const load = () => {
    adminFetch<{ data: CreditTerm[] }>('/admin/credit-terms')
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load credit terms'));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!q.trim() || customer) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      adminFetch<{ data: ContactOption[] }>('/admin/crm/contacts', { query: { q, pageSize: 5 } })
        .then((res) => setOptions(res.data))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, customer]);

  const save = async () => {
    const creditLimitMinor = Math.round(parseFloat(limit) * 100);
    if (!customer || Number.isNaN(creditLimitMinor) || creditLimitMinor < 0) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/credit-terms/${customer.id}`, {
        method: 'PUT',
        body: { creditLimitMinor, paymentTermDays: parseInt(termDays, 10) || 30 },
      });
      setCustomer(null);
      setLimit('');
      setTermDays('30');
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save credit term');
    } finally {
      setSaving(false);
    }
  };

  const toggleHold = async (row: CreditTerm) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/credit-terms/${row.customerId}`, {
        method: 'PUT',
        body: { creditLimitMinor: row.creditLimitMinor, paymentTermDays: row.paymentTermDays, isOnHold: !row.isOnHold },
      });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the hold');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Credit Terms" description="Which customers trade on account, their limit, and any credit hold." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 space-y-4 max-w-md">
        <h2 className="font-medium text-neutral-900">Set a customer&apos;s credit term</h2>
        <div>
          {customer ? (
            <div className="flex items-center justify-between field-input">
              <span>
                {customer.name} {customer.phoneE164 ? `· ${customer.phoneE164}` : ''}
              </span>
              <button type="button" onClick={() => setCustomer(null)} className="text-xs text-accent-hover hover:underline">
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className="field-input w-full"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search customer by name or phone..."
              />
              {options.length > 0 ? (
                <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(o);
                          setOptions([]);
                        }}
                        className="w-full p-2 text-start text-sm hover:bg-neutral-50"
                      >
                        {o.name} {o.phoneE164 ? `· ${o.phoneE164}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="ct-limit" className="mb-1 block text-sm font-medium text-neutral-900">
              Credit limit
            </label>
            <input
              id="ct-limit"
              type="number"
              min="0"
              step="0.01"
              className="field-input w-full"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="w-28">
            <label htmlFor="ct-days" className="mb-1 block text-sm font-medium text-neutral-900">
              Payment days
            </label>
            <input
              id="ct-days"
              type="number"
              min="0"
              className="field-input w-full"
              value={termDays}
              onChange={(e) => setTermDays(e.target.value)}
            />
          </div>
        </div>
        <button onClick={save} disabled={saving || !customer || !limit} className="btn-primary">
          Save
        </button>
      </div>

      {rows && rows.length === 0 ? (
        <EmptyState title="No credit terms set" description="No customer currently trades on account." />
      ) : (
        <div className="overflow-hidden">
          <DataTable
            rows={rows}
            loading={!rows}
            emptyLabel="No credit terms found."
            rowKey={(r) => r.id}
            columns={[
              { header: 'Customer', cell: (r) => r.customerId, muted: true },
              { header: 'Limit', align: 'end', numeric: true, cell: (r) => formatMoney(r.creditLimitMinor) },
              { header: 'Terms', align: 'end', cell: (r) => `Net ${r.paymentTermDays}` },
              { header: 'Status', cell: (r) => (r.isOnHold ? <StatusBadge status="CANCELLED" label="On hold" /> : <StatusBadge status="ACTIVE" label="Active" />) },
              {
                header: '',
                align: 'end',
                cell: (r) => (
                  <button onClick={() => toggleHold(r)} disabled={busy} className={r.isOnHold ? 'btn-secondary' : 'btn-danger'}>
                    {r.isOnHold ? 'Lift hold' : 'Apply hold'}
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
