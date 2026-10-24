'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDate, formatMoneyIn, formatNumber } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, EmptyState, ListPageSkeleton, MetricStrip, PageHeader, Section } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { ManagedServicesInvoice, ManagedServicesInvoicesResponse, ManagedServicesUsageResponse } from '@/types/api';

/**
 * doc 14 (commercial-licensing-agency/14-managed-services-module.md) — the
 * one page this module ships. Deliberately small: this deployment's own
 * plan/status, the last 30 days of storage and email usage, and the
 * invoice list with the Stripe-hosted pages Stripe already generates. No
 * self-service plan changes in v1 — "contact us to change your plan" is a
 * complete v1 answer per the doc's own scope decision.
 */
export default function ManagedServicesPage() {
  const [usage, setUsage] = useState<ManagedServicesUsageResponse | null>(null);
  const [invoices, setInvoices] = useState<ManagedServicesInvoicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [usageResult, invoicesResult] = await Promise.all([
        adminFetch<ManagedServicesUsageResponse>('/managed-services/usage'),
        adminFetch<ManagedServicesInvoicesResponse>('/managed-services/invoices'),
      ]);
      setUsage(usageResult);
      setInvoices(invoicesResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load hosting and billing information');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestSnapshot = usage?.snapshots[0] ?? null;

  return (
    <>
      <PageHeader
        title="Hosting & Billing"
        description="Your plan, usage and invoices on this deployment's managed hosting. Contact us to change your plan."
      />

      {error ? (
        <p role="alert" className="text-sm text-feedback-negative">
          {error}
        </p>
      ) : null}

      {busy && !usage ? (
        <ListPageSkeleton />
      ) : usage ? (
        <Section title="This deployment">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={usage.status} />
            <span className="text-sm text-neutral-900/60">
              {capitalize(usage.planKey)} plan · {capitalize(usage.resourceTier)} tier
            </span>
          </div>

          {latestSnapshot ? (
            <MetricStrip
              label="Usage summary"
              items={[
                { key: 'database', label: 'Database size', value: formatBytes(latestSnapshot.databaseBytes) },
                {
                  key: 'emails',
                  label: 'Emails sent (30d)',
                  value: latestSnapshot.emailsSent30d != null ? formatNumber(latestSnapshot.emailsSent30d) : '—',
                },
                { key: 'users', label: 'Active users (30d)', value: formatNumber(latestSnapshot.activeUsers30d) },
              ]}
            />
          ) : (
            <EmptyState
              title="No usage recorded yet"
              description="Usage is captured once a night. Check back tomorrow."
            />
          )}
        </Section>
      ) : null}

      <Section title="Invoices">
        <DataTable<ManagedServicesInvoice>
          rows={invoices?.invoices ?? null}
          loading={busy && !invoices}
          emptyLabel="No invoices yet."
          rowKey={(invoice) => invoice.id}
          columns={[
            {
              header: 'Period',
              cell: (invoice) => `${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`,
            },
            {
              header: 'Amount',
              align: 'end',
              numeric: true,
              cell: (invoice) => formatMoneyIn(invoice.amountMinor, invoices?.currency ?? 'usd'),
            },
            {
              header: 'Status',
              cell: (invoice) => <StatusBadge status={invoice.stripePaymentStatus ?? invoice.status} />,
            },
            {
              header: 'Due',
              muted: true,
              cell: (invoice) => (invoice.dueAt ? formatDate(invoice.dueAt) : '—'),
            },
            {
              header: '',
              cell: (invoice) =>
                invoice.stripeHostedInvoiceUrl ? (
                  <a href={invoice.stripeHostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-text">
                    View invoice
                  </a>
                ) : null,
            },
          ]}
        />
      </Section>
    </>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
