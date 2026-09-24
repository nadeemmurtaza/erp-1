'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatDate, formatMoney, formatNumber, toMajor } from '@newax/shared';
import { SalesChart } from '@/components/admin/sales-chart';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import type { VisitorAnalytics } from '@/types/api';
import { ROUTES } from '@/constants/routes';
import { DataTable, Disclosure, Loading, MetricStrip, PageHeader, Section } from '@/components/ui';
import { RangePicker, type RangeDays } from '@/components/admin/range-picker';
import { useEnabledModules } from '@/components/admin/deployment-modules';
import { isModuleEnabled } from '@/utils/module-gate';

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

interface TradingPartnerSummary {
  id: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { can } = useAdminSession();
  const enabledModules = useEnabledModules();
  const trackingOn = isModuleEnabled('tracking', enabledModules);
  const crmOn = isModuleEnabled('crm', enabledModules);
  const ordersOn = isModuleEnabled('orders', enabledModules);
  const catalogOn = isModuleEnabled('catalog', enabledModules);
  const stitchingOn = isModuleEnabled('stitching', enabledModules);
  const tradingPartnersOn = isModuleEnabled('tradingpartners', enabledModules);

  const [days, setDays] = useState<RangeDays>(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [extended, setExtended] = useState<ExtendedAnalyticsSlice | null>(null);
  const [visitors, setVisitors] = useState<VisitorAnalytics | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [pendingPartners, setPendingPartners] = useState(0);
  const [error, setError] = useState<string | null>(null);


  // No analytics.view permission means no dashboard to read — the analytics
  // endpoints below would just 403 — so send them to the queue instead.
  const lacksDashboard = !can('analytics.view');

  useEffect(() => {
    if (lacksDashboard) router.replace('/admin/stitching');
  }, [lacksDashboard, router]);

  useEffect(() => {
    if (lacksDashboard) return;
    let cancelled = false;

    // `tracking`/`crm`/`tradingpartners` are separate modules that may be
    // off for this deployment — their routes would 404, so only fetched
    // when enabled rather than failing the whole dashboard for a B2B-only
    // shop with no consumer storefront.
    Promise.all([
      adminFetch<Dashboard>('/admin/analytics/dashboard', { query: { days } }),
      adminFetch<ExtendedAnalyticsSlice>('/admin/analytics/extended', { query: { days } }),
      trackingOn ? adminFetch<VisitorAnalytics>('/admin/analytics/visitors', { query: { days } }) : null,
      crmOn ? adminFetch<FollowUp[]>('/admin/crm/follow-ups/due') : [],
      tradingPartnersOn ? adminFetch<{ data: TradingPartnerSummary[] }>('/admin/trading-partners') : null,
    ])
      .then(([dashboard, extendedData, visitorData, due, partners]) => {
        if (cancelled) return;
        setData(dashboard);
        setExtended(extendedData);
        setVisitors(visitorData);
        setFollowUps(due);
        setPendingPartners(partners?.data.filter((p) => p.status === 'PENDING').length ?? 0);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the dashboard');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [days, lacksDashboard, trackingOn, crmOn, tradingPartnersOn]);



  if (error) {
    return (
      <p role="alert" className="text-sm text-feedback-negative">
        {error}
      </p>
    );
  }

  if (!data || !extended || (trackingOn && !visitors)) {
    return <Loading />;
  }

  const attention = [
    {
      label: 'Orders to confirm',
      value: data.needsAttention.pendingOrders,
      href: '/admin/orders?status=PENDING',
      module: 'orders',
    },
    {
      label: 'Payments to approve',
      value: data.needsAttention.paymentsAwaitingApproval,
      href: '/admin/payments',
      module: 'payments',
    },
    {
      label: 'Follow-ups due',
      value: data.needsAttention.followUpsDue,
      href: '/admin/contacts',
      module: 'crm',
    },
    {
      label: 'Variants low on stock',
      value: data.needsAttention.lowStockVariants,
      href: '/admin/products',
      module: 'inventory',
    },
    {
      label: 'Failed background events',
      value: data.needsAttention.failedEvents,
      href: '/admin/orders',
      module: undefined,
    },
    {
      label: 'Abandoned carts',
      value: visitors?.abandonedCarts ?? 0,
      href: '/admin/reports',
      module: 'cart',
    },
    {
      label: 'Trading partners awaiting connection',
      value: pendingPartners,
      href: '/admin/trading-partners',
      module: 'tradingpartners',
    },
  ].filter((item) => item.value > 0 && isModuleEnabled(item.module, enabledModules));

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

        Flex, not a grid. A three-column grid holding four chips leaves two
        empty cells on the second row, and an empty cell in a bordered grid
        reads as something that failed to load.
      */}
      <Section title="Needs attention">
        {attention.length === 0 ? (
          <p className="text-sm text-neutral-900/60">Nothing waiting. Everything is up to date.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {attention.map((item) => (
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
        )}
      </Section>

      {/*
       * The strip is the overview and every cell is a way into its own
       * detail. Four screens' worth of breakdown live here, one click apart
       * and none of it on screen until asked for — which is also what closed
       * the hole this page used to carry, where a chart sat in two columns of
       * a three-column grid and the third column was simply empty.
       */}
      <MetricStrip
        label="Shop summary"
        lead="today"
        className="mb-10"
        items={[
          ...(!ordersOn
            ? []
            : [
          {
            key: 'today',
            label: 'Today',
            value: formatMoney(data.today.revenue),
            delta: {
              label: `${data.today.orders} ${data.today.orders === 1 ? 'order' : 'orders'}`,
              direction: 'flat' as const,
            },
            detail: (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900">Revenue</h3>
                    <p className="text-xs text-neutral-900/60">
                      Daily, excluding cancelled and returned orders.
                    </p>
                  </div>
                  <RangePicker value={days} onChange={setDays} />
                </div>

                <SalesChart series={data.salesSeries} />

                <Disclosure label="Revenue as a table" className="mt-4">
                  <div className="max-h-64 overflow-auto">
                    <DataTable
                      rows={[...data.salesSeries].reverse()}
                      rowKey={(point) => point.date}
                      emptyLabel="No sales in this window."
                      columns={[
                        { header: 'Date', cell: (point) => point.date, muted: true },
                        {
                          header: 'Orders',
                          align: 'end',
                          numeric: true,
                          cell: (point) => point.orders,
                          muted: true,
                        },
                        {
                          header: 'Revenue',
                          align: 'end',
                          numeric: true,
                          cell: (point) => formatNumber(toMajor(point.revenue)),
                        },
                      ]}
                    />
                  </div>
                </Disclosure>
              </>
            ),
          },
          {
            key: 'month',
            label: 'This month',
            value: formatMoney(data.month.revenue),
            delta: {
              label: `${data.month.orders} ${data.month.orders === 1 ? 'order' : 'orders'}`,
              direction: 'flat' as const,
            },
            detail: (
              <div className="grid gap-6 fold:grid-cols-2">
                <div>
                  <h3 className="eyebrow mb-3">Average order value</h3>
                  <p className="text-2xl font-medium tabular-nums text-neutral-900">
                    {formatMoney(data.averageOrderValue)}
                  </p>
                  <p className="mt-1 text-xs text-neutral-900/60">
                    Across {data.month.orders} {data.month.orders === 1 ? 'order' : 'orders'} this
                    month.
                  </p>
                </div>

                <div>
                  <h3 className="eyebrow mb-3">Revenue by category</h3>
                  {extended.revenueByCategory.length === 0 ? (
                    <p className="text-sm text-neutral-900/60">No sales in this window.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {extended.revenueByCategory.slice(0, 6).map((row) => (
                        <li
                          key={row.category}
                          className="flex items-baseline justify-between gap-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-neutral-900">{row.category}</span>
                          <span className="shrink-0 tabular-nums text-neutral-900/60">
                            {formatMoney(row.revenue)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ),
          },
          ]),
          ...(!trackingOn || !visitors
            ? []
            : [
          {
            key: 'visitors',
            label: 'Visitors',
            value: formatNumber(visitors.totalVisitors),
            delta: {
              label: visitorsHint(days, visitors.visitorsChangePercent),
              direction: visitorDirection(visitors.visitorsChangePercent),
            },
            detail: (
              <div className="grid gap-6 fold:grid-cols-2">
                <div>
                  <h3 className="eyebrow mb-3">Where they stop</h3>
                  <ul className="divide-y divide-neutral-100">
                    {[
                      { label: 'Product views', value: visitors.funnel.productViews },
                      { label: 'Added to cart', value: visitors.funnel.addToCart },
                      { label: 'Checkout started', value: visitors.funnel.checkoutStarted },
                      { label: 'Purchases completed', value: visitors.funnel.purchasesCompleted },
                    ].map((stage) => (
                      <li
                        key={stage.label}
                        className="flex items-baseline justify-between gap-3 py-2 text-sm"
                      >
                        <span className="text-neutral-900">{stage.label}</span>
                        <span className="tabular-nums text-neutral-900/60">
                          {formatNumber(stage.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="eyebrow mb-3">Where they came from</h3>
                  {visitors.trafficSources.length === 0 ? (
                    <p className="text-sm text-neutral-900/60">No page views in this window.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {visitors.trafficSources.slice(0, 6).map((row) => (
                        <li
                          key={row.source}
                          className="flex items-baseline justify-between gap-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-neutral-900">{row.source}</span>
                          <span className="shrink-0 tabular-nums text-neutral-900/60">
                            {formatNumber(row.count)} · {row.percent}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={ROUTES.admin.insights}
                    className="btn-text mt-3"
                  >
                    Full traffic report
                  </Link>
                </div>
              </div>
            ),
          },
          ]),
          {
            key: 'customers',
            label: 'Customers',
            value: formatNumber(data.customers.total),
            delta: {
              label: `${data.customers.repeat} repeat · ${data.customers.newThisMonth} new`,
              direction: 'flat' as const,
            },
            detail: (
              <div className="grid gap-6 fold:grid-cols-2">
                <div>
                  <h3 className="eyebrow mb-3">Follow-ups due</h3>
                  {followUps.length === 0 ? (
                    <p className="text-sm text-neutral-900/60">Nothing due. Nobody forgotten.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {followUps.slice(0, 6).map((task) => (
                        <li key={task.id} className="py-2">
                          <p className="text-sm text-neutral-900">{task.note}</p>
                          <p className="text-xs text-neutral-900/60">
                            {task.contact?.name ?? task.lead?.name ?? 'Unassigned'} · due{' '}
                            {formatDate(task.dueAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link href={ROUTES.admin.contacts} className="btn-text mt-3">
                    All customers
                  </Link>
                </div>

                <div>
                  <h3 className="eyebrow mb-3">Best sellers</h3>
                  {data.topProducts.length === 0 ? (
                    <p className="text-sm text-neutral-900/60">No sales in this window.</p>
                  ) : (
                    <ul className="divide-y divide-neutral-100">
                      {data.topProducts.slice(0, 6).map((product) => (
                        <li
                          key={product.name}
                          className="flex items-baseline justify-between gap-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-neutral-900">{product.name}</span>
                          <span className="shrink-0 tabular-nums text-neutral-900/60">
                            {product.quantity} sold
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />

      {/*
       * What is happening in the workshop and the catalogue right now. These
       * are states rather than figures, so they stay on the page rather than
       * behind a metric — and they sit in a grid sized to what it holds, not
       * a three-column one with a permanent gap in it.
       */}
      <div className="grid gap-8 fold:grid-cols-2">
        {stitchingOn && data.stitchingByStage.length > 0 ? (
          <Section
            title="Tailoring in progress"
            action={
              <Link href={ROUTES.admin.stitching} className="btn-text">
                Tailor queue
              </Link>
            }
          >
            {/* Six named stages: a labelled list reads better than a chart. */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {data.stitchingByStage.map((row) => (
                <div key={row.stage} className="flex justify-between gap-2">
                  <dt className="text-neutral-900/60">
                    {row.stage.charAt(0) + row.stage.slice(1).toLowerCase()}
                  </dt>
                  <dd className="font-medium tabular-nums text-neutral-900">{row.count}</dd>
                </div>
              ))}
            </dl>
          </Section>
        ) : null}

        {catalogOn ? (
          <Section
            title="Catalogue"
            action={
              <Link href={ROUTES.admin.products} className="btn-text">
                Products
              </Link>
            }
          >
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <Mini label="Live" value={data.catalogue.live} />
              <Mini label="Drafts" value={data.catalogue.drafts} />
              <Mini label="Services" value={data.catalogue.services} />
            </dl>
          </Section>
        ) : null}
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-neutral-900/60">{label}</dt>
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

