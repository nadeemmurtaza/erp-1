'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { DataTable } from '@/components/ui';

interface TradingPartnerListRow {
  id: string;
  name: string;
  kind: 'SUPPLIER' | 'CUSTOMER' | 'BOTH';
  outboundBaseUrl: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  _count: { suppliers: number };
}

interface OverdueInvoicesSummary {
  count: number;
  totalMinor: number;
  oldestDueDate: string | null;
}

export default function TradingPartnersPage() {
  const [partners, setPartners] = useState<TradingPartnerListRow[] | null>(null);
  const [overdue, setOverdue] = useState<OverdueInvoicesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    adminFetch<{ data: TradingPartnerListRow[] }>('/admin/trading-partners')
      .then((res) => setPartners(res.data))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load trading partners'))
      .finally(() => setBusy(false));

    // Best-effort: a broken tile must never block the rest of the page.
    adminFetch<OverdueInvoicesSummary>('/admin/invoices/overdue-summary')
      .then(setOverdue)
      .catch(() => undefined);
  }, []);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Trading Partners</h1>
          <p className="text-sm text-neutral-900/60">
            Suppliers and buyers connected electronically — link a supplier to
            one so its bills arrive automatically instead of being typed in
            by hand.
          </p>
        </div>
        <Link href="/admin/trading-partners/new" className="btn-primary">
          New partner
        </Link>
      </div>

      {overdue ? (
        <Link href={ROUTES.admin.invoicesOverdue} className="card lift mb-6 block p-4">
          <p className="text-xs text-neutral-900/60">Overdue invoices</p>
          <p className={`mt-1 text-lg font-semibold ${overdue.count > 0 ? 'text-red-700' : 'text-neutral-900'}`}>
            {overdue.count} · {formatMoney(overdue.totalMinor)}
          </p>
          {overdue.oldestDueDate ? (
            <p className="mt-1 text-xs text-neutral-900/60">Oldest due {formatDate(overdue.oldestDueDate)}</p>
          ) : null}
        </Link>
      ) : null}

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <DataTable
          rows={partners}
          loading={busy && !partners}
          loadingLabel="Loading..."
          emptyLabel="No trading partners yet."
          rowKey={(partner) => partner.id}
          columns={[
            {
              header: 'Name',
              cell: (partner) => (
                <Link href={`/admin/trading-partners/${partner.id}`} className="text-accent hover:underline">
                  {partner.name}
                </Link>
              ),
              className: 'font-medium',
            },
            {
              header: 'Kind',
              muted: true,
              cell: (partner) => partner.kind,
            },
            {
              header: 'Status',
              cell: (partner) => (
                <span
                  className={
                    partner.status === 'ACTIVE'
                      ? 'rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800'
                      : partner.status === 'SUSPENDED'
                        ? 'rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800'
                        : 'rounded px-2 py-0.5 text-xs font-medium bg-neutral-200 text-neutral-900/80'
                  }
                >
                  {partner.status}
                </span>
              ),
            },
            {
              header: 'Outbound URL',
              muted: true,
              cell: (partner) => partner.outboundBaseUrl || '—',
            },
            {
              header: 'Linked suppliers',
              align: 'end',
              muted: true,
              cell: (partner) => partner._count.suppliers,
            },
          ]}
        />
      </div>
    </>
  );
}
