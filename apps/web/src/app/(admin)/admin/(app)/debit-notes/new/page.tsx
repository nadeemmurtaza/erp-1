'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { PageHeader } from '@/components/ui';
import { PartyPicker } from '@/components/admin/party-picker';

export default function NewDebitNotePage() {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState('');
  const [supplierBillId, setSupplierBillId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const amountMinor = Math.round(parseFloat(amount) * 100);
    if (!supplierId || !amountMinor || amountMinor <= 0 || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await adminFetch<{ id: string }>('/admin/debit-notes', {
        method: 'POST',
        body: { supplierId, supplierBillId: supplierBillId.trim() || undefined, amountMinor, reason: reason.trim() },
      });
      router.push(ROUTES.admin.debitNote(note.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create debit note');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="New debit note" description="Drafted first — issuing it posts the ledger entry, a separate step." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 space-y-4 max-w-md">
        <div>
          <label htmlFor="dn-supplier" className="mb-1 block text-sm font-medium text-neutral-900">
            Supplier
          </label>
          <PartyPicker
            id="dn-supplier"
            partyRole="SUPPLIER"
            value={supplierId}
            placeholder="Search suppliers by name or phone..."
            onSelect={(result) => setSupplierId(result.supplierId ?? '')}
          />
        </div>

        <div>
          <label htmlFor="dn-bill" className="mb-1 block text-sm font-medium text-neutral-900">
            Supplier bill (optional)
          </label>
          <input
            id="dn-bill"
            className="field-input w-full"
            value={supplierBillId}
            onChange={(e) => setSupplierBillId(e.target.value)}
            placeholder="Bill id this corrects — leave blank if none"
          />
        </div>

        <div>
          <label htmlFor="dn-amount" className="mb-1 block text-sm font-medium text-neutral-900">
            Amount
          </label>
          <input
            id="dn-amount"
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
          <label htmlFor="dn-reason" className="mb-1 block text-sm font-medium text-neutral-900">
            Reason
          </label>
          <textarea
            id="dn-reason"
            className="field-input w-full"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this debit is being issued"
          />
        </div>
      </div>

      <button onClick={submit} disabled={saving || !supplierId || !amount || !reason.trim()} className="btn-primary">
        Save draft
      </button>
    </>
  );
}
