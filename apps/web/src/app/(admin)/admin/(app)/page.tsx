'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatMoney, toMajor, THEME_COLORS } from '@yaseen/shared';
import { SalesChart } from '@/components/admin/sales-chart';
import { DonutChart } from '@/components/admin/donut-chart';
import { GaugeChart } from '@/components/admin/gauge-chart';
import { FunnelChart } from '@/components/admin/funnel-chart';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import type { MonthlyTarget, VisitorAnalytics } from '@/types/api';
import { ROUTES } from '@/constants/routes';

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
  monthlyTarget: MonthlyTarget;
}

/** Only the slice this page needs — the full shape is consumed by reports/page.tsx. */
interface ExtendedAnalyticsSlice {
  revenueByCategory: Array<{ category: string; revenue: number }>;
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
  const router = useRouter();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [extended, setExtended] = useState<ExtendedAnalyticsSlice | null>(null);
  const [visitors, setVisitors] = useState<VisitorAnalytics | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingTarget, setEditingTarget] = useState(false);
  const [targetDraft, setTargetDraft] = useState('0');
  const [targetSaving, setTargetSaving] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // No analytics.view permission means no dashboard to read — the analytics
  // endpoints below would just 403 — so send them to the queue instead.
  const lacksDashboard = !getStoredUser()?.permissions.includes('analytics.view');

  useEffect(() => {
    if (lacksDashboard) router.replace('/admin/stitching');
  }, [lacksDashboard, router]);

  useEffect(() => {
    if (lacksDashboard) return;
    let cancelled = false;

    Promise.all([
      adminFetch<Dashboard>('/admin/analytics/dashboard', { query: { days } }),
      adminFetch<ExtendedAnalyticsSlice>('/admin/analytics/extended', { query: { days } }),
      adminFetch<VisitorAnalytics>('/admin/analytics/visitors', { query: { days } }),
      adminFetch<FollowUp[]>('/admin/crm/follow-ups/due'),
    ])
      .then(([dashboard, extendedData, visitorData, due]) => {
        if (cancelled) return;
        setData(dashboard);
        setExtended(extendedData);
        setVisitors(visitorData);
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
  }, [days, lacksDashboard]);

  function openTargetEditor() {
    if (!data) return;
    // Rupees on screen, paisa in the API — same ×100/÷100 boundary as the
    // garments page's stitching-fee field.
    setTargetDraft(String(data.monthlyTarget.targetAmount / 100));
    setTargetError(null);
    setEditingTarget(true);
  }

  async function saveTarget(event: React.FormEvent) {
    event.preventDefault();
    setTargetSaving(true);
    setTargetError(null);

    try {
      const targetAmount = Math.round(Number(targetDraft || 0) * 100);
      const monthlyTarget = await adminFetch<MonthlyTarget>('/admin/analytics/monthly-target', {
        method: 'PATCH',
        body: { targetAmount },
      });
      // Splice the recomputed target back into the already-loaded dashboard
      // rather than refetching the whole thing.
      setData((current) => (current ? { ...current, monthlyTarget } : current));
      setEditingTarget(false);
    } catch (cause) {
      setTargetError(cause instanceof Error ? cause.message : 'Could not save the target');
    } finally {
      setTargetSaving(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!data || !extended || !visitors) {
    return <p className="text-sm text-neutral-900/50">Loading…</p>;
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
    {
      label: 'Abandoned carts',
      value: visitors.abandonedCarts,
      href: '/admin/reports',
    },
  ].filter((item) => item.value > 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-900/60">How the shop is doing right now.</p>
        </div>
        <Link href={ROUTES.admin.productNew} className="btn-primary">
          Add product
        </Link>
      </div>

      {/* The headline numbers are stat tiles, not a chart. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          index={0}
          label="Today"
          value={formatMoney(data.today.revenue)}
          hint={`${data.today.orders} ${data.today.orders === 1 ? 'order' : 'orders'}`}
        />
        <Stat
          index={1}
          label="This month"
          value={formatMoney(data.month.revenue)}
          hint={`${data.month.orders} ${data.month.orders === 1 ? 'order' : 'orders'}`}
        />
        <Stat
          index={2}
          label="Total visitors"
          value={visitors.totalVisitors.toLocaleString('en-PK')}
          hint={visitorsHint(days, visitors.visitorsChangePercent)}
        />
        <Stat
          index={3}
          label="Customers"
          value={String(data.customers.total)}
          hint={`${data.customers.repeat} repeat · ${data.customers.newThisMonth} new this month`}
        />
      </div>

      {attention.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {attention.map((item, idx) => (
            <li key={item.label} className="animate-slideUp" style={{ animationDelay: `${(idx + 5) * 75}ms` }}>
              <Link
                href={item.href}
                className="inline-flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-1.5 text-sm text-neutral-900/80 transition-colors hover:bg-amber-600/20"
              >
                <span className="font-semibold text-neutral-900">{item.value}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Revenue</h2>
              <p className="text-xs text-neutral-900/50">Daily, excluding cancelled and returned orders.</p>
            </div>

            <div className="flex gap-1" role="group" aria-label="Date range">
              {RANGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  aria-pressed={days === option}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    days === option ? 'bg-accent-hover text-white' : 'text-neutral-900/70 hover:bg-white',
                  )}
                >
                  {option} days
                </button>
              ))}
            </div>
          </div>

          <SalesChart series={data.salesSeries} />
        </section>

        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Monthly target</h2>
            {!editingTarget ? (
              <button
                type="button"
                onClick={openTargetEditor}
                className="text-xs font-medium text-accent-hover hover:underline"
              >
                Edit target
              </button>
            ) : null}
          </div>

          {editingTarget ? (
            <form onSubmit={saveTarget} className="mt-4 space-y-3">
              <div>
                <label htmlFor="monthly-target-input" className="field-label">
                  Target this month (Rs)
                </label>
                <input
                  id="monthly-target-input"
                  type="number"
                  min="0"
                  step="1000"
                  value={targetDraft}
                  onChange={(event) => setTargetDraft(event.target.value)}
                  className="field-input"
                  autoFocus
                />
              </div>

              {targetError ? (
                <p role="alert" className="text-xs text-red-700">
                  {targetError}
                </p>
              ) : null}

              <div className="flex gap-2">
                <button type="submit" disabled={targetSaving} className="btn-primary">
                  {targetSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTarget(false);
                    setTargetError(null);
                  }}
                  className="btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <GaugeChart
                percent={data.monthlyTarget.percent}
                caption={
                  data.monthlyTarget.targetAmount > 0
                    ? `${formatMoney(data.monthlyTarget.achievedAmount)} of ${formatMoney(data.monthlyTarget.targetAmount)}`
                    : 'No target set yet'
                }
              />
              <p className="mt-3 border-t border-white pt-3 text-xs text-neutral-900/50">
                Average order <span className="font-semibold text-neutral-900">{formatMoney(data.averageOrderValue)}</span>
              </p>
            </>
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Top categories <span className="font-normal text-neutral-900/50">· last {days} days</span>
          </h2>
          <div className="mt-4">
            <DonutChart
              items={extended.revenueByCategory.map((row) => ({ label: row.category, value: row.revenue }))}
              valueFormatter={formatMoney}
            />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Conversion funnel <span className="font-normal text-neutral-900/50">· last {days} days</span>
          </h2>
          <div className="mt-4">
            <FunnelChart
              stages={[
                { label: 'Product views', value: visitors.funnel.productViews },
                { label: 'Added to cart', value: visitors.funnel.addToCart },
                { label: 'Checkout started', value: visitors.funnel.checkoutStarted },
                { label: 'Purchases completed', value: visitors.funnel.purchasesCompleted },
              ]}
            />
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Traffic sources <span className="font-normal text-neutral-900/50">· last {days} days</span>
          </h2>
          {visitors.trafficSources.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-900/50">No page views in this window.</p>
          ) : (
            <BarList
              items={visitors.trafficSources.map((row) => ({
                key: row.source,
                label: capitalize(row.source),
                value: row.percent,
                sub: `${row.count} ${row.count === 1 ? 'view' : 'views'}`,
              }))}
              valueFormatter={(value) => `${value}%`}
            />
          )}
        </section>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            Best sellers <span className="font-normal text-neutral-900/50">· last {days} days</span>
          </h2>

          {data.topProducts.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-900/50">No sales in this window.</p>
          ) : (
            <BarList
              items={data.topProducts.map((product) => ({
                key: product.name,
                label: product.name,
                value: product.revenue,
                sub: `${product.quantity} sold`,
              }))}
              valueFormatter={formatMoney}
            />
          )}
        </section>

        <div className="space-y-4">
          <section className="card">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">Follow-ups due</h2>
              <Link href={ROUTES.admin.contacts} className="text-xs font-medium text-accent-hover hover:underline">
                Customers
              </Link>
            </div>

            {followUps.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-900/50">Nothing due. Nobody forgotten.</p>
            ) : (
              <ul className="divide-y divide-white">
                {followUps.slice(0, 6).map((task) => (
                  <li key={task.id} className="px-4 py-3">
                    <p className="text-sm text-neutral-900">{task.note}</p>
                    <p className="text-xs text-neutral-900/50">
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
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">Tailoring in progress</h2>
                <Link
                  href={ROUTES.admin.stitching}
                  className="text-xs font-medium text-accent-hover hover:underline"
                >
                  Tailor queue
                </Link>
              </div>
              {/* Six named stages: a labelled list reads better than a chart. */}
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                {data.stitchingByStage.map((row) => (
                  <div key={row.stage} className="flex justify-between gap-2">
                    <dt className="text-neutral-900/60">
                      {row.stage.charAt(0) + row.stage.slice(1).toLowerCase()}
                    </dt>
                    <dd className="font-medium text-neutral-900">{row.count}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-neutral-900">Catalogue</h2>
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
        <summary className="cursor-pointer text-sm font-semibold text-neutral-900">
          Revenue as a table
        </summary>
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr>
                <th scope="col" className="py-1 text-start text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                  Date
                </th>
                <th scope="col" className="py-1 text-end text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                  Orders
                </th>
                <th scope="col" className="py-1 text-end text-xs font-semibold uppercase tracking-wide text-neutral-900/50">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white">
              {[...data.salesSeries].reverse().map((point) => (
                <tr key={point.date}>
                  <td className="py-1 text-neutral-900/70">{point.date}</td>
                  <td className="py-1 text-end tabular-nums text-neutral-900/70">{point.orders}</td>
                  <td className="py-1 text-end tabular-nums text-neutral-900">
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

function Stat({ index, label, value, hint }: { index?: number; label: string; value: string; hint?: string }) {
  return (
    <div
      className="card p-4 animate-fadeIn"
      style={index !== undefined ? { animationDelay: `${(index + 1) * 75}ms` } : undefined}
    >
      <p className="text-sm text-neutral-900/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-900/40">{hint}</p> : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-neutral-900/50">{label}</dt>
      <dd className="text-lg font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}

/** Ranked list with a proportional bar, matching reports/page.tsx's BarList. */
function BarList({
  items,
  valueFormatter,
}: {
  items: Array<{ key: string; label: string; value: number; sub?: string }>;
  valueFormatter: (value: number) => string;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="mt-4 space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-neutral-900">{item.label}</span>
            <span className="shrink-0 text-neutral-900/70">{valueFormatter(item.value)}</span>
          </div>
          {/* Sequential single hue: more of the metric is a longer bar. */}
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                backgroundColor: THEME_COLORS.accent.DEFAULT,
              }}
            />
          </div>
          {item.sub ? <p className="mt-0.5 text-xs text-neutral-900/40">{item.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** vs the immediately preceding window of the same length, matching VisitorAnalytics.visitorsChangePercent. */
function visitorsHint(days: number, changePercent: number | null): string {
  if (changePercent === null) return `Last ${days} days`;
  const sign = changePercent > 0 ? '+' : '';
  return `${sign}${changePercent}% vs previous ${days} days`;
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}
