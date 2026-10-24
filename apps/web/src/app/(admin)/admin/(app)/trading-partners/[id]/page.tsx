'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';

interface TradingPartnerDetail {
  id: string;
  name: string;
  kind: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  outboundBaseUrl: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  _count: { suppliers: number };
}

export default function TradingPartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [partner, setPartner] = useState<TradingPartnerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  const [outboundKey, setOutboundKey] = useState('');
  const [savingOutboundKey, setSavingOutboundKey] = useState(false);
  const [outboundKeySaved, setOutboundKeySaved] = useState(false);

  const [deleting, setDeleting] = useState(false);

  function load() {
    adminFetch<TradingPartnerDetail>(`/admin/trading-partners/${id}`)
      .then(setPartner)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load trading partner'))
      .finally(() => setBusy(false));
  }

  useEffect(load, [id]);

  async function setStatus(status: TradingPartnerDetail['status']) {
    try {
      const updated = await adminFetch<TradingPartnerDetail>(`/admin/trading-partners/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      setPartner(updated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update status');
    }
  }

  async function rotateInboundKey() {
    setRotating(true);
    setError(null);
    try {
      const result = await adminFetch<{ apiKey: string }>(`/admin/trading-partners/${id}/rotate-inbound-key`, {
        method: 'POST',
      });
      setIssuedKey(result.apiKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not issue a key');
    } finally {
      setRotating(false);
    }
  }

  async function saveOutboundKey(event: React.FormEvent) {
    event.preventDefault();
    setSavingOutboundKey(true);
    setError(null);
    try {
      await adminFetch(`/admin/trading-partners/${id}/outbound-key`, {
        method: 'POST',
        body: { apiKey: outboundKey },
      });
      setOutboundKey('');
      setOutboundKeySaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the key');
    } finally {
      setSavingOutboundKey(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${partner?.name}"? Any linked suppliers fall back to manual entry.`)) return;
    setDeleting(true);
    try {
      await adminFetch(`/admin/trading-partners/${id}`, { method: 'DELETE' });
      router.push('/admin/trading-partners');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove the trading partner');
      setDeleting(false);
    }
  }

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading trading partner...</p>;
  }

  if (error && !partner) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!partner) return null;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">{partner.name}</h1>
          <p className="text-sm text-neutral-900/60">
            {partner.kind} · {partner._count.suppliers} linked supplier{partner._count.suppliers === 1 ? '' : 's'}
          </p>
        </div>
        <button type="button" onClick={() => void remove()} disabled={deleting} className="btn-ghost text-red-700">
          {deleting ? 'Removing…' : 'Remove'}
        </button>
      </div>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card mb-6 p-6">
        <h2 className="mb-4 text-lg font-medium text-neutral-900">Status</h2>
        <div className="flex gap-2">
          {(['PENDING', 'ACTIVE', 'SUSPENDED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => void setStatus(status)}
              className={
                partner.status === status
                  ? 'rounded px-3 py-1.5 text-sm font-medium bg-accent text-white'
                  : 'rounded px-3 py-1.5 text-sm font-medium bg-neutral-100 text-neutral-900/70 hover:bg-neutral-200'
              }
            >
              {status}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-900/60">
          A SUSPENDED partner&apos;s inbound key stops working immediately, even if it still hashes correctly.
        </p>
      </div>

      <div className="card mb-6 p-6">
        <h2 className="mb-1 text-lg font-medium text-neutral-900">Inbound key</h2>
        <p className="mb-4 text-sm text-neutral-900/60">
          What <strong>they</strong> present calling <strong>us</strong>. Shown exactly once — copy it
          into their system now.
        </p>

        {issuedKey ? (
          <div className="mb-4 rounded-md bg-amber-50 p-4">
            <p className="mb-2 text-sm font-medium text-amber-900">
              This key will not be shown again.
            </p>
            <code className="block break-all rounded bg-white p-3 text-xs text-neutral-900">{issuedKey}</code>
          </div>
        ) : null}

        <button type="button" onClick={() => void rotateInboundKey()} disabled={rotating} className="btn-secondary">
          {rotating ? 'Issuing…' : issuedKey ? 'Rotate again' : 'Issue inbound key'}
        </button>
      </div>

      <div className="card p-6">
        <h2 className="mb-1 text-lg font-medium text-neutral-900">Outbound key</h2>
        <p className="mb-4 text-sm text-neutral-900/60">
          What <strong>we</strong> present calling <strong>them</strong> at their API — the credential
          they issued you. Stored encrypted; never shown again once saved.
        </p>

        <form onSubmit={saveOutboundKey} className="flex max-w-lg items-end gap-3">
          <label className="block flex-1">
            <span className="field-label">Their key</span>
            <input
              type="password"
              value={outboundKey}
              onChange={(event) => {
                setOutboundKey(event.target.value);
                setOutboundKeySaved(false);
              }}
              placeholder={outboundKeySaved ? '•••••••• saved' : 'Paste the key they gave you'}
              className="field-input"
            />
          </label>
          <button type="submit" disabled={savingOutboundKey || !outboundKey} className="btn-primary">
            {savingOutboundKey ? 'Saving…' : 'Save'}
          </button>
        </form>
        {outboundKeySaved ? <p className="mt-2 text-sm text-green-700">Saved.</p> : null}
      </div>
    </>
  );
}
