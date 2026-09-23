'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import type { PurchasingSpend, PurchasingSuppliers } from '@/types/api';
import { DataTable, EmptyState, Loading, MetricStrip, PageHeader, Section, Tabs } from '@/components/ui';

/**
 * WO-D.2 (10-admin-dashboard.md Track D) — what the business has committed
 * to buy, actually received, been billed for, and still owes, plus which
 * suppliers that spend is going to and how reliably they deliver. Ships
 * against the live "one endpoint, one screen" idiom (ADR-019/020), not
 * Track A's unbuilt report-registry catalog.
 */
export default function PurchasingSpendPage() {
  const [spend, setSpend] = useState<PurchasingSpend | null>(null);
  const [suppliers, setSuppliers] = useState<PurchasingSuppliers | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [spendData, suppliersData] = await Promise.all([
        adminFetch<PurchasingSpend>('/admin/analytics/purchasing/spend', { query: { days: 90 } }),
        adminFetch<PurchasingSuppliers>('/admin/analytics/purchasing/suppliers', { query: { days: 90 } }),
      ]);
      setSpend(spendData);
      setSuppliers(suppliersData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load purchasing spend');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Purchasing spend" description="What's been ordered, received, billed and is still owed." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  if (!spend || !suppliers) {
    return (
      <>
        <PageHeader title="Purchasing spend" description="What's been ordered, received, billed and is still owed." />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Purchasing spend" description="What's been ordered, received, billed and is still owed — last 90 days." />

      <Tabs
        label="Purchasing spend areas"
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <>
                <Section title="Last 90 days">
                  <MetricStrip
                    label="Purchasing totals"
                    items={[
                      { key: 'ordered', label: 'Ordered', value: formatMoney(spend.totals.ordered) },
                      { key: 'received', label: 'Received', value: formatMoney(spend.totals.received) },
                      { key: 'billed', label: 'Billed', value: formatMoney(spend.totals.billed) },
                      { key: 'unpaid', label: 'Still owed', value: formatMoney(spend.totals.unpaid) },
                    ]}
                  />
                </Section>

                <Section title="Received spend by category">
                  {spend.byCategory.length === 0 ? (
                    <EmptyState title="No goods received in this window" />
                  ) : (
                    <DataTable
                      rows={spend.byCategory}
                      rowKey={(row) => row.category}
                      columns={[
                        { header: 'Category', cell: (row) => row.category },
                        { header: 'Spend', cell: (row) => formatMoney(row.spend), align: 'end', numeric: true },
                      ]}
                    />
                  )}
                </Section>
              </>
            ),
          },
          {
            key: 'suppliers',
            label: 'Suppliers',
            content: (
              <Section title="By supplier" description="Ranked by received spend — last 90 days.">
                {suppliers.rows.length === 0 ? (
                  <EmptyState title="No goods received in this window" description="Supplier figures appear once a purchase order has been received." />
                ) : (
                  <DataTable
                    rows={suppliers.rows}
                    rowKey={(row) => row.supplierId}
                    columns={[
                      {
                        header: 'Supplier',
                        cell: (row) => (
                          <Link href={`/admin/suppliers/${row.supplierId}`} className="font-medium text-accent-hover hover:underline">
                            {row.name}
                          </Link>
                        ),
                      },
                      { header: 'Spend', cell: (row) => formatMoney(row.spend), align: 'end', numeric: true },
                      { header: 'Share', cell: (row) => `${(row.share / 100).toFixed(1)}%`, align: 'end', numeric: true, muted: true },
                      { header: 'Orders', cell: (row) => row.orders, align: 'end', numeric: true, muted: true },
                      {
                        header: 'On time',
                        cell: (row) => (row.onTimeRateBps === null ? '—' : `${(row.onTimeRateBps / 100).toFixed(0)}%`),
                        align: 'end',
                        numeric: true,
                      },
                      {
                        header: 'Avg. lead time',
                        cell: (row) => (row.avgLeadDays === null ? '—' : `${row.avgLeadDays}d`),
                        align: 'end',
                        numeric: true,
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
