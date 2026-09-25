'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { PageHeader } from '@/components/ui';

interface ContactOption {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
}

export default function NewCreditNotePage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const submit = async () => {
    const amountMinor = Math.round(parseFloat(amount) * 100);
    if (!customer || !amountMinor || amountMinor <= 0 || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await adminFetch<{ id: string }>('/admin/credit-notes', {
        method: 'POST',
        body: { customerId: customer.id, orderId: orderId.trim() || undefined, amountMinor, reason: reason.trim() },
      });
      router.push(ROUTES.admin.creditNote(note.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create credit note');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="New credit note"
        description="Drafted first — issuing it (and posting the ledger entry) is a separate, explicit step."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 space-y-4 max-w-md">
        <div>
          <label htmlFor="cn-customer" className="mb-1 block text-sm font-medium text-neutral-900">
            Customer
          </label>
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
                id="cn-customer"
                className="field-input w-full"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or phone..."
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

        <div>
          <label htmlFor="cn-order" className="mb-1 block text-sm font-medium text-neutral-900">
            Order (optional)
          </label>
          <input
            id="cn-order"
            className="field-input w-full"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="Order id this credits — leave blank for a goodwill credit"
          />
        </div>

        <div>
          <label htmlFor="cn-amount" className="mb-1 block text-sm font-medium text-neutral-900">
            Amount
          </label>
          <input
            id="cn-amount"
            type="number"
            min="0"
            step="0.01"
            className="field-input w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div>
          <label htmlFor="cn-reason" className="mb-1 block text-sm font-medium text-neutral-900">
            Reason
          </label>
          <textarea
            id="cn-reason"
            className="field-input w-full"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this credit is being issued"
          />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={saving || !customer || !amount || !reason.trim()}
        className="btn-primary"
      >
        Save draft
      </button>
    </>
  );
}
