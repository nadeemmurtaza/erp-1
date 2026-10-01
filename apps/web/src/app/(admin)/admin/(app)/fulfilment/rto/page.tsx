'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { MetricStrip, DataTable, type MetricItem } from '@/components/ui';
import { DateField } from '@/components/ui/date-field';

interface RateRow {
  key: string;
  name?: string;
  total: number;
  rto: number;
  ratePercent: number;
}

interface RtoStats {
  from: string;
  to: string;
  overallRatePercent: number;
  totalShipments: number;
  totalRto: number;
  byCity: RateRow[];
  byProduct: RateRow[];
  byOrderValue: RateRow[];
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * WO-6.7's own dashboard requirement — "the input to which cities to
 * require advance payment from, and Phase 9's COD risk score."
 */
export default function RtoRatePage() {
  const [range, setRange] = useState(defaultRange());
  const [stats, setStats] = useState<RtoStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    adminFetch<RtoStats>(`/admin/fulfilment/rto?from=${range.from}&to=${range.to}`)
      .then(setStats)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load RTO stats'));
  }, [range]);

  const metrics: MetricItem[] = stats
    ? [
        { key: 'rate', label: 'Overall RTO rate', value: `${stats.overallRatePercent}%` },
        { key: 'shipments', label: 'Shipments dispatched', value: stats.totalShipments },
        { key: 'rto', label: 'Returned to origin', value: stats.totalRto },
      ]
    : [];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">RTO rate</h1>
          <p className="text-sm text-neutral-900/60">
            A shipment reaching RETURNED with no customer return request — by city, product and order value.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateField
            value={range.from}
            onChange={(next) => setRange((current) => ({ ...current, from: next }))}
            aria-label="From date"
          />
          <DateField
            value={range.to}
            onChange={(next) => setRange((current) => ({ ...current, to: next }))}
            aria-label="To date"
          />
        </div>
      </div>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      {stats ? <MetricStrip label="RTO summary" items={metrics} className="mb-8" /> : <div className="skeleton mb-8 h-16 rounded-md" />}

      <div className="grid gap-8 lg:grid-cols-3">
        <RateTable title="By city" rows={stats?.byCity ?? null} labelHeader="City" />
        <RateTable title="By product" rows={stats?.byProduct ?? null} labelHeader="Product" useName />
        <RateTable title="By order value" rows={stats?.byOrderValue ?? null} labelHeader="Band" />
      </div>
    </>
  );
}

function RateTable({
  title,
  rows,
  labelHeader,
  useName,
}: {
  title: string;
  rows: RateRow[] | null;
  labelHeader: string;
  useName?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      <DataTable
        rows={rows?.slice(0, 10) ?? null}
        loading={rows === null}
        rowKey={(row) => row.key}
        emptyLabel="No shipments in this range."
        columns={[
          { header: labelHeader, cell: (row) => (useName ? row.name ?? row.key : row.key) },
          { header: 'RTO rate', align: 'end', numeric: true, cell: (row) => `${row.ratePercent}%` },
          { header: 'RTO / total', align: 'end', numeric: true, muted: true, cell: (row) => `${row.rto} / ${row.total}` },
        ]}
      />
    </div>
  );
}
