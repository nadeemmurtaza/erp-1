'use client';

import { useEffect, useState, use } from 'react';
// No clsx import needed
import { adminFetch } from '@/lib/admin-client';

interface SupplierDetail {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  paymentTerms: string | null;
  leadTimeDays: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  tradingPartnerId: string | null;
  tradingPartner: { id: string; name: string; status: string } | null;
}

interface TradingPartnerOption {
  id: string;
  name: string;
  status: string;
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [partnerOptions, setPartnerOptions] = useState<TradingPartnerOption[] | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);

  useEffect(() => {
    adminFetch<SupplierDetail>(`/admin/suppliers/${id}`)
      .then((res) => {
        setSupplier(res);
        setSelectedPartnerId(res.tradingPartnerId ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load supplier'))
      .finally(() => setBusy(false));

    // Trading Partners is an optional module — a 404/off deployment just
    // means the picker never appears, not an error the page surfaces.
    adminFetch<{ data: TradingPartnerOption[] }>('/admin/trading-partners')
      .then((res) => setPartnerOptions(res.data))
      .catch(() => setPartnerOptions(null));
  }, [id]);

  async function saveTradingPartnerLink() {
    setSavingLink(true);
    setLinkSaved(false);
    try {
      const updated = await adminFetch<SupplierDetail>(`/admin/suppliers/${id}`, {
        method: 'PATCH',
        body: { tradingPartnerId: selectedPartnerId || null },
      });
      setSupplier(updated);
      setLinkSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the trading partner link');
    } finally {
      setSavingLink(false);
    }
  }

  if (busy) {
    return <p className="text-sm text-neutral-900/50 p-4">Loading supplier...</p>;
  }

  if (error || !supplier) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error || 'Supplier not found'}
      </p>
    );
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">{supplier.name}</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Supplier details and configuration.
      </p>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-medium text-neutral-900 mb-4">Contact Info</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <div>
            <dt className="text-neutral-900/60 mb-1">Contact Name</dt>
            <dd className="font-medium">{supplier.contactName || '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-900/60 mb-1">Phone</dt>
            <dd className="font-medium">{supplier.phone || '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-900/60 mb-1">Email</dt>
            <dd className="font-medium">{supplier.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-neutral-900/60 mb-1">City</dt>
            <dd className="font-medium">{supplier.city || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-neutral-900/60 mb-1">Address</dt>
            <dd className="font-medium">{supplier.address || '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-medium text-neutral-900 mb-4">Terms & Settings</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <div>
            <dt className="text-neutral-900/60 mb-1">Status</dt>
            <dd className="font-medium">
              {supplier.isActive ? <span className="text-green-600">Active</span> : <span className="text-neutral-900/50">Inactive</span>}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-900/60 mb-1">Lead Time</dt>
            <dd className="font-medium">{supplier.leadTimeDays} days</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-neutral-900/60 mb-1">Payment Terms</dt>
            <dd className="font-medium">{supplier.paymentTerms || '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-neutral-900/60 mb-1">Notes</dt>
            <dd className="font-medium whitespace-pre-wrap">{supplier.notes || '—'}</dd>
          </div>
        </dl>
      </div>

      {partnerOptions ? (
        <div className="card mt-6 p-6">
          <h2 className="text-lg font-medium text-neutral-900 mb-1">Trading partner</h2>
          <p className="mb-4 text-sm text-neutral-900/60">
            Link this supplier to a connected trading partner so its bills
            arrive automatically instead of being typed in by hand. Leave
            unlinked for manual entry, exactly as before.
          </p>
          <div className="flex max-w-md items-end gap-3">
            <label className="block flex-1">
              <span className="field-label">Trading partner</span>
              <select
                value={selectedPartnerId}
                onChange={(event) => {
                  setSelectedPartnerId(event.target.value);
                  setLinkSaved(false);
                }}
                className="field-input"
              >
                <option value="">Not linked (manual entry)</option>
                {partnerOptions.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name} ({partner.status})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void saveTradingPartnerLink()}
              disabled={savingLink || selectedPartnerId === (supplier.tradingPartnerId ?? '')}
              className="btn-primary"
            >
              {savingLink ? 'Saving…' : 'Save'}
            </button>
          </div>
          {linkSaved ? <p className="mt-2 text-sm text-green-700">Saved.</p> : null}
        </div>
      ) : null}
    </>
  );
}
