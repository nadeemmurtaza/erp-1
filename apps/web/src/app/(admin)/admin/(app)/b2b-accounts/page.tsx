'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { PageHeader, DataTable, EmptyState } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';

interface ContactOption {
  id: string;
  name: string;
  phoneE164: string | null;
}

interface B2BAccount {
  id: string;
  customerId: string;
  customerName: string | null;
  isActive: boolean;
  requiresPurchaseOrder: boolean;
  approvalPolicy: { thresholdMinor: number; approverContactIds: string[] } | null;
}

/** 149-b2b-accounts-approvals-sector-packs.md — staff-side admin screen (WO-149.4). */
export default function B2BAccountsPage() {
  const [rows, setRows] = useState<B2BAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [requiresPo, setRequiresPo] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () => {
    adminFetch<{ data: B2BAccount[] }>('/admin/accounts/b2b')
      .then((res) => setRows(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load B2B accounts'));
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

  const create = async () => {
    if (!customer) return;
    setCreating(true);
    setError(null);
    try {
      await adminFetch('/admin/accounts/b2b', {
        method: 'POST',
        body: { customerId: customer.id, requiresPurchaseOrder: requiresPo },
      });
      setCustomer(null);
      setRequiresPo(false);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the account');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (row: B2BAccount) => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/accounts/b2b/${row.id}/update`, {
        method: 'POST',
        body: { isActive: !row.isActive },
      });
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="B2B Accounts"
        description="Buyers who pay on account instead of tendering at checkout, and their purchase-approval thresholds."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 space-y-4 max-w-md">
        <h2 className="font-medium text-neutral-900">Open a standing account</h2>
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="field-check" checked={requiresPo} onChange={(e) => setRequiresPo(e.target.checked)} />
          Requires a purchase-order reference on every order
        </label>
        <button onClick={create} disabled={creating || !customer} className="btn-primary">
          Open account
        </button>
      </div>

      {rows && rows.length === 0 ? (
        <EmptyState title="No B2B accounts yet" description="Open one above once a buyer needs to pay on account." />
      ) : (
        <DataTable
          rows={rows}
          loading={!rows}
          emptyLabel="No B2B accounts found."
          rowKey={(r) => r.id}
          columns={[
            {
              header: 'Customer',
              cell: (r) => (
                <Link href={`/admin/b2b-accounts/${r.id}`} className="text-accent-hover hover:underline">
                  {r.customerName ?? r.customerId}
                </Link>
              ),
            },
            { header: 'Purchase order', cell: (r) => (r.requiresPurchaseOrder ? 'Required' : '—') },
            {
              header: 'Approval threshold',
              align: 'end',
              numeric: true,
              cell: (r) => (r.approvalPolicy ? `Rs ${Math.round(r.approvalPolicy.thresholdMinor / 100)}` : 'None'),
            },
            { header: 'Status', cell: (r) => (r.isActive ? <StatusBadge status="ACTIVE" label="Active" /> : <StatusBadge status="CANCELLED" label="Inactive" />) },
            {
              header: '',
              align: 'end',
              cell: (r) => (
                <button onClick={() => toggleActive(r)} disabled={busy} className={r.isActive ? 'btn-danger' : 'btn-secondary'}>
                  {r.isActive ? 'Deactivate' : 'Activate'}
                </button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
