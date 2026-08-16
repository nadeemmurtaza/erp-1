'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { formatMoney, toMajor } from '@yaseen/shared';
import { SalesChart } from '@/components/admin/sales-chart';
import { adminFetch } from '@/lib/admin-client';

interface Dashboard {
  today: { orders: number; revenue: number };
  month: { orders: number; revenue: number };
  averageOrderValue: number;
  needsAttention: {
    pendingOrders: number;
    paymentsAwaitingApproval: number;
    followUpsDue: number;
    lowStockVariants: number;
    failedEvents: number;
  };
  catalogue: { live: number; drafts: number; services: number };
  customers: { total: number; repeat: number; newThisMonth: number };
  salesSeries: Array<{ date: string; orders: number; revenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  stitchingByStage: Array<{ stage: string; count: number }>;
}

interface FollowUp {
  id: string;
  note: string;
  dueAt: string;
  contact: { id: string; name: string; phoneE164: string | null } | null;
  lead: { id: string; name: string; phone: string | null } | null;
}

const RANGES = [7, 30, 90] as const;

export default function AdminDashboardPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      adminFetch<Dashboard>('/admin/analytics/dashboard', { query: { days } }),
      adminFetch<FollowUp[]>('/admin/crm/follow-ups/due'),
    ])
      .then(([dashboard, due]) => {
        if (cancelled) return;
        setData(dashboard);
        setFollowUps(due);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the dashboard');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!data) {
    return <p className="text-sm text-ink/50">Loading…</p>;
  }

  const attention = [
    {
      label: 'Orders to confirm',
      value: data.needsAttention.pendingOrders,
      href: '/admin/orders?status=PENDING',
    },
    {
      label: 'Payments to approve',
      value: data.needsAttention.paymentsAwaitingApproval,
      href: '/admin/payments',
    },
    {
      label: 'Follow-ups due',
      value: data.needsAttention.followUpsDue,
      href: '/admin/contacts',
    },
    {
      label: 'Variants low on stock',
      value: data.needsAttention.lowStockVariants,
      href: '/admin/products',
    },
    {
      label: 'Failed background events',
      value: data.needsAttention.failedEvents,
      href: '/admin/orders',
    },
  ].filter((item) => item.value > 0);

  const topRevenue = Math.max(...data.topProducts.map((product) => product.revenue), 1);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink/60">How the shop is doing right now.</p>
        </div>
        <Link href="/admin/products/new" className="btn-primary">
          Add product
        </Link>
      </div>

      {/* The headline numbers are stat tiles, not a chart. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Today"
          value={formatMoney(data.today.revenue)}
          hint={`${data.today.orders} ${data.today.orders === 1 ? 'order' : 'orders'}`}
        />
        <Stat
          label="This month"
          value={formatMoney(data.month.revenue)}
          hint={`${data.month.orders} ${data.month.orders === 1 ? 'order' : 'orders'}`}
        />
        <Stat label="Average order" value={formatMoney(data.averageOrderValue)} hint="All time" />
        <Stat
          label="Customers"
          value={String(data.customers.total)}
          hint={`${data.customers.repeat} repeat · ${data.customers.newThisMonth} new this month`}
        />
      </div>

      {attention.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {attention.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-gold/10 px-3 py-1.5 text-sm text-ink/80 hover:bg-gold/20"
              >
                <span className="font-semibold text-ink">{item.value}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="card mt-6 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Revenue</h2>
            <p className="text-xs text-ink/50">
              Daily, excluding cancelled and returned orders.
            </p>
          </div>

          <div className="flex gap-1" role="group" aria-label="Date range">
            {RANGES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                aria-pressed={days === option}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  days === option
                    ? 'bg-brand-600 text-white'
                    : 'text-ink/70 hover:bg-sand-100',
                )}
              >
                {option} days
              </button>
            ))}
          </div>
        </div>

        <SalesChart series={data.salesSeries} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-ink">
            Best sellers <span className="font-normal text-ink/50">· last {days} days</span>
          </h2>

          {data.topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">No sales in this window.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.topProducts.map((product) => (
                <li key={product.name}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">{product.name}</span>
                    <span className="shrink-0 text-ink/70">
                      {formatMoney(product.revenue)}
                    </span>
                  </div>
                  {/* Sequential single hue: more revenue is a longer bar. */}
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max((product.revenue / topRevenue) * 100, 2)}%`,
                        backgroundColor: '#0f8fa3',
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-ink/40">{product.quantity} sold</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="flex items-center justify-between border-b border-sand-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Follow-ups due</h2>
              <Link href="/admin/contacts" className="text-xs font-medium text-brand-700 hover:underline">
                Customers
              </Link>
            </div>

            {followUps.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink/50">Nothing due. Nobody forgotten.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {followUps.slice(0, 6).map((task) => (
                  <li key={task.id} className="px-4 py-3">
                    <p className="text-sm text-ink">{task.note}</p>
                    <p className="text-xs text-ink/50">
                      {task.contact?.name ?? task.lead?.name ?? 'Unassigned'} · due{' '}
                      {new Date(task.dueAt).toLocaleDateString('en-PK')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.stitchingByStage.length > 0 ? (
            <section className="card p-4">
              <h2 className="text-sm font-semibold text-ink">Tailoring in progress</h2>
              {/* Six named stages: a labelled list reads better than a chart. */}
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {data.stitchingByStage.map((row) => (
                  <div key={row.stage} className="flex justify-between gap-2">
                    <dt className="text-ink/60">
                      {row.stage.charAt(0) + row.stage.slice(1).toLowerCase()}
                    </dt>
                    <dd className="font-medium text-ink">{row.count}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-ink">Catalogue</h2>
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <Mini label="Live" value={data.catalogue.live} />
              <Mini label="Drafts" value={data.catalogue.drafts} />
              <Mini label="Services" value={data.catalogue.services} />
            </dl>
          </section>
        </div>
      </div>

      {/* Everything the chart plots, also available as numbers. */}
      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Revenue as a table
        </summary>
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th scope="col" className="py-1 text-start text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Date
                </th>
                <th scope="col" className="py-1 text-end text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Orders
                </th>
                <th scope="col" className="py-1 text-end text-xs font-semibold uppercase tracking-wide text-ink/50">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-100">
              {[...data.salesSeries].reverse().map((point) => (
                <tr key={point.date}>
                  <td className="py-1 text-ink/70">{point.date}</td>
                  <td className="py-1 text-end tabular-nums text-ink/70">{point.orders}</td>
                  <td className="py-1 text-end tabular-nums text-ink">
                    {toMajor(point.revenue).toLocaleString('en-PK')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/40">{hint}</p> : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-ink/50">{label}</dt>
      <dd className="text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
