'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { useFilterParam } from '@/components/ui';
import { DataTable, PageHeader } from '@/components/ui';

interface InvoiceListRow {
  id: string;
  number: string;
  status: 'ISSUED' | 'PAID' | 'VOID';
  currency: string;
  issueDate: string;
  dueDate: string | null;
  totalMinor: number;
}

/**
 * Invoices issued to trading partners (doc 18) — the "detail on click"
 * screen the overdue-invoices tile (56-overdue-invoices-counter.md) links
 * into. `?overdue=true` narrows to exactly the ISSUED-and-past-due set the
 * tile itself counts, never a client-side re-filter of a different query.
 */
export default function InvoicesPage() {
  const overdueParam = useFilterParam('overdue');
  const overdue = overdueParam === 'true';

  const [invoices, setInvoices] = useState<InvoiceListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: InvoiceListRow[] }>('/admin/invoices', {
        query: overdue ? { overdue: 'true' } : undefined,
      });
      setInvoices(res.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load invoices');
    } finally {
      setBusy(false);
    }
  }, [overdue]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOverdue = (invoice: InvoiceListRow) =>
    invoice.status === 'ISSUED' && Boolean(invoice.dueDate) && new Date(invoice.dueDate!) < new Date();

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Billing documents issued to trading partners."
        action={
          <div className="flex gap-2">
            <Link
              href={ROUTES.admin.invoices}
              className={overdue ? 'btn-secondary' : 'btn-primary'}
              aria-current={overdue ? undefined : 'page'}
            >
              All
            </Link>
            <Link
              href={ROUTES.admin.invoicesOverdue}
              className={overdue ? 'btn-primary' : 'btn-secondary'}
              aria-current={overdue ? 'page' : undefined}
            >
              Overdue only
            </Link>
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <DataTable
          rows={invoices}
          loading={busy && !invoices}
          emptyLabel={overdue ? 'No overdue invoices.' : 'No invoices yet.'}
          rowKey={(invoice) => invoice.id}
          columns={[
            { header: 'Number', cell: (invoice) => invoice.number, className: 'font-medium' },
            { header: 'Issued', muted: true, cell: (invoice) => formatDate(invoice.issueDate) },
            {
              header: 'Due',
              cell: (invoice) => (
                <span className={isOverdue(invoice) ? 'font-medium text-red-700' : 'text-neutral-900/70'}>
                  {invoice.dueDate ? formatDate(invoice.dueDate) : '—'}
                  {isOverdue(invoice) ? ' · overdue' : ''}
                </span>
              ),
            },
            { header: 'Status', muted: true, cell: (invoice) => invoice.status },
            {
              header: 'Total',
              align: 'end',
              numeric: true,
              cell: (invoice) => formatMoney(invoice.totalMinor),
            },
          ]}
        />
      </div>
    </>
  );
}
