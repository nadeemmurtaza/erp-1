'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';

export default function NewTradingPartnerPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'SUPPLIER' | 'CUSTOMER' | 'BOTH'>('SUPPLIER');
  const [outboundBaseUrl, setOutboundBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const created = await adminFetch<{ id: string }>('/admin/trading-partners', {
        method: 'POST',
        body: { name, kind, outboundBaseUrl: outboundBaseUrl || undefined },
      });
      router.push(`/admin/trading-partners/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the trading partner');
      setSaving(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">New trading partner</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Register a supplier, buyer, or business that runs its own system —
        you&apos;ll link it to a supplier and issue its keys next.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <form onSubmit={submit} className="card max-w-lg space-y-4 p-6">
        <label className="block">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            className="field-input"
          />
        </label>

        <label className="block">
          <span className="field-label">Kind</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
            className="field-input"
          >
            <option value="SUPPLIER">Supplier — we buy from them</option>
            <option value="CUSTOMER">Customer — they buy from us</option>
            <option value="BOTH">Both</option>
          </select>
        </label>

        <label className="block">
          <span className="field-label">Their API (optional)</span>
          <input
            value={outboundBaseUrl}
            onChange={(event) => setOutboundBaseUrl(event.target.value)}
            placeholder="https://partner.example.com/api"
            className="field-input"
          />
          <span className="mt-1 block text-xs text-neutral-900/50">
            Where we send documents to them. Leave blank if they only push to us.
          </span>
        </label>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Creating…' : 'Create partner'}
        </button>
      </form>
    </>
  );
}
