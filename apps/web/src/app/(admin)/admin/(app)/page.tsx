'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { formatDate, formatMoney, intlTag, toMajor } from '@newax/shared';
import { SalesChart } from '@/components/admin/sales-chart';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import type { VisitorAnalytics } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { Loading, MetricStrip, PageHeader, Section } from '@/components/ui';

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



  if (error) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!data || !extended || !visitors) {
    return <Loading />;
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
      <PageHeader
        title="Dashboard"
        description="What needs doing right now. For how the shop is performing, see Insights."
        action={
          <Link href={ROUTES.admin.productNew} className="btn-primary">
            Add product
          </Link>
        }
      />

      {/*
        First, and prominent. This is the question the page exists to answer,
        and it used to sit under four KPI tiles as a row of small chips — the
        one actionable thing on the page, rendered smaller than the things
        that are only informative.
      */}
      <Section title="Needs attention">
        {attention.length === 0 ? (
          <p className="text-sm text-neutral-900/50">Nothing waiting. Everything is up to date.</p>
        ) : (
          <ul className="grid gap-2 xs:grid-cols-2 lg:grid-cols-3">
            {attention.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="flex items-baseline gap-2 rounded border border-amber-600/40 bg-amber-600/10 px-3 py-2.5 text-sm transition-colors hover:bg-amber-600/20"
                >
                  <span className="text-base font-semibold text-neutral-900">{item.value}</span>
                  <span className="text-neutral-900/80">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/*
       * One strip, not four cards. Today's takings are what the shop opens
       * this page to see, so that cell leads and the rest sit back a shade.
       */}
      <MetricStrip
        label="Shop summary"
        lead="today"
        items={[
          {
            key: 'today',
            label: 'Today',
            value: formatMoney(data.today.revenue),
            delta: {
              label: `${data.today.orders} ${data.today.orders === 1 ? 'order' : 'orders'}`,
              direction: 'flat',
            },
          },
          {
            key: 'month',
            label: 'This month',
            value: formatMoney(data.month.revenue),
            delta: {
              label: `${data.month.orders} ${data.month.orders === 1 ? 'order' : 'orders'}`,
              direction: 'flat',
            },
          },
          {
            key: 'visitors',
            label: 'Visitors',
            value: visitors.totalVisitors.toLocaleString(intlTag('en')),
            delta: {
              label: visitorsHint(days, visitors.visitorsChangePercent),
              direction: visitorDirection(visitors.visitorsChangePercent),
            },
          },
          {
            key: 'customers',
            label: 'Customers',
            value: String(data.customers.total),
            delta: {
              label: `${data.customers.repeat} repeat · ${data.customers.newThisMonth} new`,
              direction: 'flat',
            },
          },
        ]}
      />



      <div className="mt-6 grid gap-4 fold:grid-cols-2 lg:grid-cols-3">
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

      </div>

      <div className="mt-6 grid gap-4 fold:grid-cols-2 lg:grid-cols-3">


      </div>

      <div className="mt-6 grid gap-4 fold:grid-cols-2">

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
                      {formatDate(task.dueAt)}
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
                    {toMajor(point.revenue).toLocaleString(intlTag('en'))}
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

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-neutral-900/50">{label}</dt>
      <dd className="text-lg font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}


/** More visitors is good news; fewer is not. Null reads as neither. */
function visitorDirection(changePercent: number | null): 'up' | 'down' | 'flat' {
  if (changePercent === null || changePercent === 0) return 'flat';
  return changePercent > 0 ? 'up' : 'down';
}

/** vs the immediately preceding window of the same length, matching VisitorAnalytics.visitorsChangePercent. */
function visitorsHint(days: number, changePercent: number | null): string {
  if (changePercent === null) return `Last ${days} days`;
  const sign = changePercent > 0 ? '+' : '';
  return `${sign}${changePercent}% vs previous ${days} days`;
}

