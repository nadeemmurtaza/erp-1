'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { statusLabel } from '@/components/common/status-badge';
import { paymentProviderLabel } from '@/constants/payment-methods';
import type { OrdersFulfilment, OrdersOverview } from '@/types/api';
import { DataTable, EmptyState, Loading, MetricStrip, PageHeader, Section, Tabs } from '@/components/ui';

/**
 * WO-D.1 (10-admin-dashboard.md Track D) — where open orders are stuck, and
 * how long each pipeline stage takes. `/admin/insights` answers "how are we
 * doing"; this answers "what needs doing now" for orders specifically — the
 * same split `/admin/insights`'s own header already draws between itself
 * and the dashboard. Ships against the live "one endpoint, one screen"
 * idiom (ADR-019/020), not Track A's unbuilt report-registry catalog.
 */
export default function OrderInsightsPage() {
  const [overview, setOverview] = useState<OrdersOverview | null>(null);
  const [fulfilment, setFulfilment] = useState<OrdersFulfilment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overviewData, fulfilmentData] = await Promise.all([
        adminFetch<OrdersOverview>('/admin/analytics/orders/overview'),
        adminFetch<OrdersFulfilment>('/admin/analytics/orders/fulfilment', { query: { days: 90 } }),
      ]);
      setOverview(overviewData);
      setFulfilment(fulfilmentData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load order insights');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Order insights" description="Where open orders are stuck, and how long each stage takes." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!overview || !fulfilment) {
    return (
      <>
        <PageHeader title="Order insights" description="Where open orders are stuck, and how long each stage takes." />
        <Loading />
      </>
    );
  }

  const totalOpen = overview.ageing.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <>
      <PageHeader title="Order insights" description="Where open orders are stuck, and how long each stage takes." />

      <Tabs
        label="Order insight areas"
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <>
                <Section title="Open orders by age" description="Not yet delivered, cancelled or returned.">
                  {totalOpen === 0 ? (
                    <EmptyState title="No open orders" description="Every order has reached delivery, cancellation or return." />
                  ) : (
                    <MetricStrip
                      label="Open orders by age"
                      items={[
                        { key: 'total', label: 'Open orders', value: totalOpen },
                        ...overview.ageing.map((bucket) => ({
                          key: bucket.label,
                          label: bucket.label,
                          value: bucket.count,
                        })),
                      ]}
                    />
                  )}
                </Section>

                <Section title="Oldest open orders" description="The 20 that have waited longest — worth a look now.">
                  <DataTable
                    rows={overview.oldestOpen}
                    rowKey={(row) => row.id}
                    emptyLabel="No open orders."
                    columns={[
                      {
                        header: 'Order',
                        cell: (row) => (
                          <Link href={`/admin/orders/${row.id}`} className="font-medium text-accent-hover hover:underline">
                            {row.number}
                          </Link>
                        ),
                      },
                      { header: 'Status', cell: (row) => statusLabel(row.status) },
                      { header: 'Placed', cell: (row) => formatDate(row.placedAt), muted: true },
                      { header: 'Age', cell: (row) => `${row.ageDays}d`, align: 'end', numeric: true },
                    ]}
                  />
                </Section>

                <Section title="By city" description="Open orders only — how many, and how old on average.">
                  <DataTable
                    rows={overview.byCity}
                    rowKey={(row) => row.city}
                    emptyLabel="No open orders."
                    columns={[
                      { header: 'City', cell: (row) => row.city },
                      { header: 'Open orders', cell: (row) => row.count, align: 'end', numeric: true },
                      { header: 'Avg. age', cell: (row) => `${row.avgAgeDays}d`, align: 'end', numeric: true, muted: true },
                    ]}
                  />
                </Section>

                <Section title="By payment method" description="Open orders only — how many, and how old on average.">
                  <DataTable
                    rows={overview.byPayment}
                    rowKey={(row) => row.provider}
                    emptyLabel="No open orders with a recorded payment."
                    columns={[
                      { header: 'Method', cell: (row) => paymentProviderLabel(row.provider) },
                      { header: 'Open orders', cell: (row) => row.count, align: 'end', numeric: true },
                      { header: 'Avg. age', cell: (row) => `${row.avgAgeDays}d`, align: 'end', numeric: true, muted: true },
                    ]}
                  />
                </Section>
              </>
            ),
          },
          {
            key: 'fulfilment',
            label: 'Fulfilment',
            content: (
              <Section
                title="Time in each stage · last 90 days"
                description="How long an order sits at each step before moving to the next."
              >
                {fulfilment.transitions.length === 0 ? (
                  <EmptyState
                    title="No status changes in this window"
                    description="Timing appears once orders start moving through statuses."
                  />
                ) : (
                  <DataTable
                    rows={fulfilment.transitions}
                    rowKey={(row) => `${row.from}-${row.to}`}
                    columns={[
                      { header: 'From', cell: (row) => statusLabel(row.from) },
                      { header: 'To', cell: (row) => statusLabel(row.to) },
                      { header: 'Orders', cell: (row) => row.count, align: 'end', numeric: true, muted: true },
                      { header: 'Avg.', cell: (row) => formatHours(row.avgHours), align: 'end', numeric: true },
                      { header: 'Median', cell: (row) => formatHours(row.medianHours), align: 'end', numeric: true, muted: true },
                    ]}
                  />
                )}
              </Section>
            ),
          },
        ]}
      />
    </>
  );
}

/** Hours under a day read as hours; a day or more reads as days, one decimal. */
function formatHours(hours: number): string {
  return hours < 24 ? `${hours}h` : `${(hours / 24).toFixed(1)}d`;
}
