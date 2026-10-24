'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { DataTable, EmptyState, PageHeader } from '@/components/ui';

interface Discount {
  id: string;
  name: string;
  type: string;
  scope: string;
  value: number;
  isActive: boolean;
  isStackable: boolean;
  usageCount: number;
  usageLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  promoCodeCount: number;
}

const TYPE_LABEL: Record<string, string> = {
  PERCENTAGE: 'Percentage',
  FIXED_AMOUNT: 'Fixed amount',
  FREE_SHIPPING: 'Free shipping',
  BUY_X_GET_Y: 'Buy X get Y',
  TIERED: 'Tiered',
};

function valueLabel(discount: Discount): string {
  if (discount.type === 'PERCENTAGE' || discount.type === 'TIERED') return `${discount.value / 100}%`;
  if (discount.type === 'FIXED_AMOUNT') return formatMoney(discount.value);
  return '—';
}

/**
 * Discount rules — the ones that apply themselves. Promo codes (the same
 * rules, plus a code) are their own screen (Law 5).
 */
export default function DiscountsPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const [discounts, setDiscounts] = useState<Discount[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: Discount[] }>('/admin/promotions/discounts?pageSize=100');
      setDiscounts(res.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load discounts');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(discount: Discount) {
    try {
      await adminFetch(`/admin/promotions/discounts/${discount.id}`, {
        method: 'PATCH',
        body: { isActive: !discount.isActive },
      });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not update the discount', 'error');
    }
  }

  async function remove(discount: Discount) {
    try {
      await adminFetch(`/admin/promotions/discounts/${discount.id}`, { method: 'DELETE' });
      addToast('Discount deleted.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not delete the discount', 'error');
    }
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title="Discounts"
        description="Automatic rules — no code needed. Promo codes are the same rules, typed in by the customer."
        action={
          <Link href="/admin/marketing/discounts/new" className="btn-primary">
            New discount
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {discounts && discounts.length === 0 && !busy ? (
        <EmptyState
          title="No discounts yet"
          description="Create a percentage, fixed-amount, free-shipping, buy-X-get-Y or tiered rule."
          action={
            <Link href="/admin/marketing/discounts/new" className="btn-primary">
              New discount
            </Link>
          }
        />
      ) : (
        <DataTable
          rows={discounts}
          loading={busy && !discounts}
          rowKey={(d) => d.id}
          emptyLabel="No discounts yet."
          columns={[
            { header: 'Name', cell: (d) => <Link href={`/admin/marketing/discounts/${d.id}`} className="font-medium hover:underline">{d.name}</Link> },
            { header: 'Type', cell: (d) => TYPE_LABEL[d.type] ?? d.type, muted: true },
            { header: 'Applies to', cell: (d) => d.scope, muted: true },
            { header: 'Value', cell: (d) => valueLabel(d) },
            { header: 'Codes', numeric: true, align: 'end', cell: (d) => d.promoCodeCount },
            {
              header: 'Redeemed',
              numeric: true,
              align: 'end',
              cell: (d) => (d.usageLimit ? `${d.usageCount} / ${d.usageLimit}` : d.usageCount),
            },
            { header: 'Window', cell: (d) => (d.endsAt ? `until ${formatDate(d.endsAt)}` : d.startsAt ? `from ${formatDate(d.startsAt)}` : 'Always on'), muted: true },
            {
              header: 'Status',
              cell: (d) => (
                <button type="button" onClick={() => void toggleActive(d)} className="text-xs text-neutral-900/60 hover:text-neutral-900">
                  {d.isActive ? 'Active' : 'Inactive'}
                </button>
              ),
            },
            {
              header: '',
              align: 'end',
              cell: (d) => (
                <button type="button" onClick={() => void remove(d)} className="text-xs text-neutral-900/60 hover:text-neutral-900">
                  Delete
                </button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
