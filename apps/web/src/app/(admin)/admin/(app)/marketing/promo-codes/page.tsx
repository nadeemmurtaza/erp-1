'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, PageHeader } from '@/components/ui';

interface Discount {
  id: string;
  name: string;
}

interface PromoCode {
  id: string;
  code: string;
  discountId: string;
  discountName: string;
  isActive: boolean;
  usageCount: number;
  usageLimit: number | null;
  expiresAt: string | null;
  batchId: string | null;
}

/**
 * Promo codes — the same discount rules, plus a code the customer types.
 * Discounts themselves are managed on their own screen (Law 5).
 */
export default function PromoCodesPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [discountId, setDiscountId] = useState('');
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('1');
  const [usageLimit, setUsageLimit] = useState('1');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [codesRes, discountsRes] = await Promise.all([
        adminFetch<{ data: PromoCode[] }>('/admin/promotions/promo-codes?pageSize=100'),
        adminFetch<{ data: Discount[] }>('/admin/promotions/discounts?pageSize=200'),
      ]);
      setCodes(codesRes.data);
      setDiscounts(discountsRes.data);
      if (!discountId && discountsRes.data[0]) setDiscountId(discountsRes.data[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load promo codes');
    } finally {
      setBusy(false);
    }
    // discountId intentionally excluded — this only seeds the default once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (!discountId) {
      addToast('Create a discount first.', 'error');
      return;
    }
    setGenerating(true);
    try {
      const result = await adminFetch<{ count: number }>('/admin/promotions/promo-codes/bulk-generate', {
        method: 'POST',
        body: {
          discountId,
          count: Number(count),
          prefix: prefix.trim() || undefined,
          usageLimit: usageLimit ? Number(usageLimit) : undefined,
        },
      });
      addToast(`Generated ${result.count} code(s).`, 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not generate codes', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function toggleActive(code: PromoCode) {
    try {
      await adminFetch(`/admin/promotions/promo-codes/${code.id}`, { method: 'PATCH', body: { isActive: !code.isActive } });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not update the code', 'error');
    }
  }

  async function remove(code: PromoCode) {
    try {
      await adminFetch(`/admin/promotions/promo-codes/${code.id}`, { method: 'DELETE' });
      addToast('Code deleted.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not delete the code', 'error');
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader title="Promo codes" description="Codes, usage and bulk generation for a campaign." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <form onSubmit={generate} className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Discount</span>
          <select className="field-input" value={discountId} onChange={(e) => setDiscountId(e.target.value)} required>
            {discounts.length === 0 ? <option value="">No discounts yet</option> : null}
            {discounts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Prefix (optional)</span>
          <input className="field-input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="SUMMER24" />
        </label>
        <label className="block">
          <span className="field-label">How many</span>
          <input type="number" min={1} max={5000} className="field-input w-24" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Uses per code</span>
          <input type="number" min={1} className="field-input w-24" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
        </label>
        <button type="submit" disabled={generating || discounts.length === 0} className="btn-primary">
          {generating ? 'Generating…' : 'Generate codes'}
        </button>
      </form>

      <DataTable
        rows={codes}
        loading={busy && !codes}
        rowKey={(c) => c.id}
        emptyLabel="No promo codes yet."
        columns={[
          { header: 'Code', cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
          { header: 'Discount', cell: (c) => c.discountName, muted: true },
          {
            header: 'Redeemed',
            numeric: true,
            align: 'end',
            cell: (c) => (c.usageLimit ? `${c.usageCount} / ${c.usageLimit}` : c.usageCount),
          },
          { header: 'Expires', cell: (c) => (c.expiresAt ? formatDate(c.expiresAt) : 'Never'), muted: true },
          {
            header: 'Status',
            cell: (c) => (
              <button type="button" onClick={() => void toggleActive(c)} className="text-xs text-neutral-900/60 hover:text-neutral-900">
                {c.isActive ? 'Active' : 'Inactive'}
              </button>
            ),
          },
          {
            header: '',
            align: 'end',
            cell: (c) => (
              <button type="button" onClick={() => void remove(c)} className="text-xs text-neutral-900/60 hover:text-neutral-900">
                Delete
              </button>
            ),
          },
        ]}
      />
    </>
  );
}
