'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@newax/shared';
import { Section } from '@/components/ui';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';

interface GrossProfitTransaction {
  orderId: string;
  orderNumber: string;
  revenue: number;
  cogs: number;
  contribution: number;
  marginBps: number;
}

interface GrossProfitToday {
  transactions: GrossProfitTransaction[];
  dayTotal: { revenue: number; cogs: number; contribution: number; marginBps: number };
}

const PREVIEW_COUNT = 5;

/**
 * WO-68.3 (68-realtime-gross-profit.md) — a new card on the existing
 * dashboard, not a new page. Silently absent for a caller lacking
 * `inventory.view_cost` — the endpoint 403s, and gross profit is
 * meaningless to show without the cost half of it, so there is no
 * degraded partial view to fall back to.
 */
export function GrossProfitTodayWidget() {
  const [data, setData] = useState<GrossProfitToday | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<GrossProfitToday>('/admin/finance/gross-profit-today')
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => {
        // No permission, or a transient failure — the rest of the dashboard still renders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const preview = data.transactions.slice(0, PREVIEW_COUNT);
  const overflow = data.transactions.length - preview.length;

  return (
    <Section title="Gross profit today">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Stat label="Revenue" value={formatMoney(data.dayTotal.revenue)} />
        <Stat label="Contribution" value={formatMoney(data.dayTotal.contribution)} />
        <Stat label="Margin" value={`${(data.dayTotal.marginBps / 100).toFixed(1)}%`} />
      </div>

      {preview.length > 0 ? (
        <ul className="mt-3 flex flex-col divide-y divide-neutral-100">
          {preview.map((transaction) => (
            <li key={transaction.orderId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <Link href={ROUTES.admin.order(transaction.orderId)} className="min-w-0 truncate text-neutral-900 hover:underline">
                {transaction.orderNumber}
              </Link>
              <span className="shrink-0 tabular-nums text-neutral-900/70">
                {formatMoney(transaction.contribution)} · {(transaction.marginBps / 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-neutral-900/60">No completed sales yet today.</p>
      )}

      {overflow > 0 ? (
        <p className="mt-2 text-xs text-neutral-900/60">{overflow} more transaction(s) today.</p>
      ) : null}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-900/60">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}
