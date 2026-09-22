'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import type { CustomersOverview, CustomersRetention, CustomersTop } from '@/types/api';
import { DataTable, EmptyState, Loading, MetricStrip, PageHeader, Section, Tabs } from '@/components/ui';

/**
 * WO-D.5 (10-admin-dashboard.md Track D) — the customer book: where they
 * are, where they came from, whether they come back, and who matters most.
 * Ships against the live "one endpoint, one screen" idiom (ADR-019/020),
 * not Track A's unbuilt report-registry catalog.
 */
export default function CustomerInsightsPage() {
  const [overview, setOverview] = useState<CustomersOverview | null>(null);
  const [retention, setRetention] = useState<CustomersRetention | null>(null);
  const [top, setTop] = useState<CustomersTop | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overviewData, retentionData, topData] = await Promise.all([
        adminFetch<CustomersOverview>('/admin/analytics/customers/overview'),
        adminFetch<CustomersRetention>('/admin/analytics/customers/retention'),
        adminFetch<CustomersTop>('/admin/analytics/customers/top'),
      ]);
      setOverview(overviewData);
      setRetention(retentionData);
      setTop(topData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load customer insights');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Customer insights" description="Where they are, where they came from, and who matters most." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!overview || !retention || !top) {
    return (
      <>
        <PageHeader title="Customer insights" description="Where they are, where they came from, and who matters most." />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Customer insights" description="Where they are, where they came from, and who matters most." />

      <Tabs
        label="Customer insight areas"
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <>
                <Section title="The customer book">
                  <MetricStrip
                    label="Customer totals"
                    items={[
                      { key: 'total', label: 'Total customers', value: overview.totals.total },
                      { key: 'repeat', label: 'Repeat customers', value: overview.totals.repeat },
                      { key: 'new', label: 'New this month', value: overview.totals.newThisMonth },
                    ]}
                  />
                </Section>

                <Section title="By city">
                  <DataTable
                    rows={overview.byCity}
                    rowKey={(row) => row.city}
                    columns={[
                      { header: 'City', cell: (row) => row.city },
                      { header: 'Customers', cell: (row) => row.count, align: 'end', numeric: true },
                    ]}
                  />
                </Section>

                <Section title="By source">
                  <DataTable
                    rows={overview.bySource}
                    rowKey={(row) => row.source}
                    columns={[
                      { header: 'Source', cell: (row) => row.source },
                      { header: 'Customers', cell: (row) => row.count, align: 'end', numeric: true },
                    ]}
                  />
                </Section>

                <Section title="By status">
                  <DataTable
                    rows={overview.byStatus}
                    rowKey={(row) => row.status}
                    columns={[
                      { header: 'Status', cell: (row) => row.status },
                      { header: 'Customers', cell: (row) => row.count, align: 'end', numeric: true },
                    ]}
                  />
                </Section>
              </>
            ),
          },
          {
            key: 'retention',
            label: 'Retention',
            content: (
              <>
                <Section title="Overall repeat rate">
                  <MetricStrip
                    label="Repeat rate"
                    items={[{ key: 'rate', label: 'Placed a second order', value: `${(retention.repeatRateBps / 100).toFixed(1)}%` }]}
                  />
                </Section>

                <Section title="Signup cohorts" description="By month signed up — how many went on to order again.">
                  {retention.cohorts.length === 0 ? (
                    <EmptyState title="No cohorts in the last 24 months" />
                  ) : (
                    <DataTable
                      rows={retention.cohorts}
                      rowKey={(row) => row.cohort}
                      columns={[
                        { header: 'Cohort', cell: (row) => row.cohort },
                        { header: 'Size', cell: (row) => row.size, align: 'end', numeric: true, muted: true },
                        { header: 'Retained', cell: (row) => row.retained, align: 'end', numeric: true },
                        {
                          header: 'Rate',
                          cell: (row) => `${row.size > 0 ? ((row.retained / row.size) * 100).toFixed(0) : 0}%`,
                          align: 'end',
                          numeric: true,
                          muted: true,
                        },
                      ]}
                    />
                  )}
                </Section>
              </>
            ),
          },
          {
            key: 'top',
            label: 'Top customers',
            content: (
              <Section title="Highest lifetime value">
                {top.rows.length === 0 ? (
                  <EmptyState title="No customers with orders yet" />
                ) : (
                  <DataTable
                    rows={top.rows}
                    rowKey={(row) => row.contactId}
                    columns={[
                      {
                        header: 'Customer',
                        cell: (row) => (
                          <Link href={ROUTES.admin.contactSearch(row.name)} className="font-medium text-accent-hover hover:underline">
                            {row.name}
                          </Link>
                        ),
                      },
                      { header: 'City', cell: (row) => row.city ?? '—', muted: true },
                      { header: 'Orders', cell: (row) => row.orders, align: 'end', numeric: true, muted: true },
                      { header: 'Lifetime value', cell: (row) => formatMoney(row.lifetimeValue), align: 'end', numeric: true },
                      { header: 'Avg. order', cell: (row) => formatMoney(row.avgOrderValue), align: 'end', numeric: true, muted: true },
                      {
                        header: 'Last order',
                        cell: (row) => (row.lastOrderAt ? formatDate(row.lastOrderAt) : '—'),
                        align: 'end',
                        muted: true,
                      },
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
