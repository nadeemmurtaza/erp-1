'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@newax/shared';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import type { InventoryMovements, InventoryValuation } from '@/types/api';
import { DataTable, EmptyState, Loading, MetricStrip, PageHeader, Section, Tabs } from '@/components/ui';

/**
 * WO-D.4 (10-admin-dashboard.md Track D) — what stock on hand is worth, and
 * how it's moving. Ships against the live "one endpoint, one screen" idiom
 * (ADR-019/020), not Track A's unbuilt report-registry catalog.
 *
 * Valuation and movements are gated by two DIFFERENT permissions
 * (inventory.view_cost, inventory.manage) — a viewer can hold either, both,
 * or neither beyond the analytics.view the nav entry itself requires, so
 * each tab fetches (and explains its absence) independently, per PRM-2.
 */
export default function InventoryInsightsPage() {
  const canViewValuation = getStoredUser()?.permissions.includes('inventory.view_cost') ?? false;
  const canViewMovements = getStoredUser()?.permissions.includes('inventory.manage') ?? false;

  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [movements, setMovements] = useState<InventoryMovements | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [valuationData, movementsData] = await Promise.all([
        canViewValuation ? adminFetch<InventoryValuation>('/admin/analytics/inventory/valuation') : Promise.resolve(null),
        canViewMovements
          ? adminFetch<InventoryMovements>('/admin/analytics/inventory/movements', { query: { days: 30 } })
          : Promise.resolve(null),
      ]);
      setValuation(valuationData);
      setMovements(movementsData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load inventory insights');
    }
  }, [canViewValuation, canViewMovements]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <>
        <PageHeader title="Inventory insights" description="What stock on hand is worth, and how it's moving." />
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      </>
    );
  }

  const loading = (canViewValuation && !valuation) || (canViewMovements && !movements);
  if (loading) {
    return (
      <>
        <PageHeader title="Inventory insights" description="What stock on hand is worth, and how it's moving." />
        <Loading />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Inventory insights" description="What stock on hand is worth, and how it's moving." />

      <Tabs
        label="Inventory insight areas"
        items={[
          {
            key: 'valuation',
            label: 'Valuation',
            content: !canViewValuation ? (
              <p className="text-sm text-neutral-900/60">Read-only — stock valuation needs the inventory.view_cost permission.</p>
            ) : (
              <>
                <Section title="Stock on hand">
                  <MetricStrip
                    label="Stock valuation totals"
                    items={[
                      { key: 'value', label: 'Total value', value: formatMoney(valuation!.totals.value) },
                      { key: 'units', label: 'Units on hand', value: valuation!.totals.units },
                      { key: 'unknown', label: 'Unknown cost', value: valuation!.totals.unknownCostVariants },
                    ]}
                  />
                </Section>

                <Section title="By category">
                  {valuation!.byCategory.length === 0 ? (
                    <EmptyState title="No stock on hand" />
                  ) : (
                    <DataTable
                      rows={valuation!.byCategory}
                      rowKey={(row) => row.categoryId ?? 'uncategorised'}
                      columns={[
                        { header: 'Category', cell: (row) => row.name },
                        { header: 'Units', cell: (row) => row.units, align: 'end', numeric: true, muted: true },
                        { header: 'Value', cell: (row) => formatMoney(row.value), align: 'end', numeric: true },
                      ]}
                    />
                  )}
                </Section>

                <Section title="By kind">
                  <DataTable
                    rows={valuation!.byKind}
                    rowKey={(row) => row.kind}
                    columns={[
                      { header: 'Kind', cell: (row) => row.kind },
                      { header: 'Units', cell: (row) => row.units, align: 'end', numeric: true, muted: true },
                      { header: 'Value', cell: (row) => formatMoney(row.value), align: 'end', numeric: true },
                    ]}
                  />
                </Section>

                <Section title="By age" description="Time since last sold.">
                  <DataTable
                    rows={valuation!.ageing}
                    rowKey={(row) => row.label}
                    columns={[
                      { header: 'Age', cell: (row) => row.label },
                      { header: 'Units', cell: (row) => row.units, align: 'end', numeric: true, muted: true },
                      { header: 'Value', cell: (row) => formatMoney(row.value), align: 'end', numeric: true },
                    ]}
                  />
                </Section>
              </>
            ),
          },
          {
            key: 'movements',
            label: 'Movements',
            content: !canViewMovements ? (
              <p className="text-sm text-neutral-900/60">Read-only — stock movements need the inventory.manage permission.</p>
            ) : (
              <>
                <Section title="Volume by reason · last 30 days">
                  {movements!.byReason.length === 0 ? (
                    <EmptyState title="No stock movement in this window" />
                  ) : (
                    <DataTable
                      rows={movements!.byReason}
                      rowKey={(row) => row.reason}
                      columns={[
                        { header: 'Reason', cell: (row) => row.reason },
                        { header: 'In', cell: (row) => row.in, align: 'end', numeric: true },
                        { header: 'Out', cell: (row) => row.out, align: 'end', numeric: true },
                        { header: 'Movements', cell: (row) => row.count, align: 'end', numeric: true, muted: true },
                      ]}
                    />
                  )}
                </Section>

                <Section title="Recent movements">
                  <DataTable
                    rows={movements!.recent}
                    rowKey={(row) => row.id}
                    emptyLabel="No recent movements."
                    columns={[
                      {
                        header: 'Variant',
                        cell: (row) => (
                          <Link href={`/admin/inventory/${row.variantId}/chain`} className="font-medium text-accent-hover hover:underline">
                            {row.name}
                          </Link>
                        ),
                      },
                      { header: 'SKU', cell: (row) => row.sku, muted: true },
                      { header: 'Reason', cell: (row) => row.reason, muted: true },
                      { header: 'Delta', cell: (row) => (row.delta > 0 ? `+${row.delta}` : row.delta), align: 'end', numeric: true },
                    ]}
                  />
                </Section>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
