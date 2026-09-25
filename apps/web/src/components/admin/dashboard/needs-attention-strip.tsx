'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Section } from '@/components/ui';
import { adminFetch } from '@/lib/admin-client';
import { isModuleEnabled } from '@/utils/module-gate';
import { useEnabledModules } from '@/components/admin/deployment-modules';

interface NeedsAttention {
  pendingOrders: number;
  paymentsAwaitingApproval: number;
  followUpsDue: number;
  lowStockVariants: number;
  failedEvents: number;
}

/**
 * "The one genuinely good part of the current page" (WO-A.4's own words) —
 * kept, not rebuilt, straight from `GET /admin/analytics/dashboard`'s
 * `needsAttention` (a cheap, un-windowed live snapshot, not a card-registry
 * concern: nobody wants "orders to confirm" compared against last month).
 * A `days` param of 7 is passed only because the endpoint requires one; this
 * screen never reads anything else it returns.
 */
export function NeedsAttentionStrip() {
  const enabledModules = useEnabledModules();
  const [data, setData] = useState<NeedsAttention | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<{ needsAttention: NeedsAttention }>('/admin/analytics/dashboard', { query: { days: 7 } })
      .then((response) => {
        if (!cancelled) setData(response.needsAttention);
      })
      .catch(() => {
        // Not fatal — the rest of the dashboard still renders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const items = [
    { label: 'Orders to confirm', value: data.pendingOrders, href: '/admin/orders?status=PENDING', module: 'orders' },
    { label: 'Payments to approve', value: data.paymentsAwaitingApproval, href: '/admin/payments', module: 'payments' },
    { label: 'Follow-ups due', value: data.followUpsDue, href: '/admin/contacts', module: 'crm' },
    { label: 'Variants low on stock', value: data.lowStockVariants, href: '/admin/products', module: 'inventory' },
    { label: 'Failed background events', value: data.failedEvents, href: '/admin/orders', module: undefined },
  ].filter((item) => item.value > 0 && isModuleEnabled(item.module, enabledModules));

  if (items.length === 0) return null;

  return (
    <Section title="Needs attention">
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.label} className="min-w-0 flex-1 basis-64">
            <Link
              href={item.href}
              className="flex h-full items-baseline gap-2 rounded border border-amber-600/40 bg-amber-600/10 px-3 py-2.5 text-sm transition-colors hover:bg-amber-600/20"
            >
              <span className="text-base font-semibold text-neutral-900">{item.value}</span>
              <span className="text-neutral-900/80">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
