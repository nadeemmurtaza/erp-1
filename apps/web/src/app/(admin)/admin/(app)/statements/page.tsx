'use client';

import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { formatMoney, formatDate } from '@newax/shared';
import { PageHeader, DataTable } from '@/components/ui';

interface ContactOption {
  id: string;
  name: string;
  phoneE164: string | null;
}

interface StatementLine {
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
  reference: string;
  amountMinor: number;
  runningBalanceMinor: number;
}

interface Statement {
  customerId: string;
  periodStart: string;
  periodEnd: string;
  openingBalanceMinor: number;
  lines: StatementLine[];
  closingBalanceMinor: number;
}

export default function StatementsPage() {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<ContactOption[]>([]);
  const [customer, setCustomer] = useState<ContactOption | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!q.trim() || customer) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      adminFetch<{ data: ContactOption[] }>('/admin/crm/contacts', { query: { q, pageSize: 5 } })
        .then((res) => setOptions(res.data))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, customer]);

  const run = async () => {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminFetch<Statement>(`/admin/statements/${customer.id}`, {
        query: { periodStart: periodStart || undefined, periodEnd: periodEnd || undefined },
      });
      setStatement(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the statement');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Customer Statements" description="Invoices, payments and credit notes for one customer over a period, chronologically." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 max-w-lg space-y-4">
        <div>
          {customer ? (
            <div className="flex items-center justify-between field-input">
              <span>
                {customer.name} {customer.phoneE164 ? `· ${customer.phoneE164}` : ''}
              </span>
              <button type="button" onClick={() => setCustomer(null)} className="text-xs text-accent-hover hover:underline">
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                className="field-input w-full"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search customer by name or phone..."
              />
              {options.length > 0 ? (
                <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(o);
                          setOptions([]);
                        }}
                        className="w-full p-2 text-start text-sm hover:bg-neutral-50"
                      >
                        {o.name} {o.phoneE164 ? `· ${o.phoneE164}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor="stmt-from" className="mb-1 block text-sm font-medium text-neutral-900">
              From
            </label>
            <input id="stmt-from" type="date" className="field-input w-full" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="flex-1">
            <label htmlFor="stmt-to" className="mb-1 block text-sm font-medium text-neutral-900">
              To
            </label>
            <input id="stmt-to" type="date" className="field-input w-full" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <button onClick={run} disabled={busy || !customer} className="btn-primary">
          View statement
        </button>
      </div>

      {statement ? (
        <>
          <div className="card p-6 mb-6 max-w-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-900/60">Opening balance</span>
              <span className="font-medium tabular-nums">{formatMoney(statement.openingBalanceMinor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-900/60">Closing balance</span>
              <span className="font-medium tabular-nums">{formatMoney(statement.closingBalanceMinor)}</span>
            </div>
          </div>

          <div className="overflow-hidden">
            <DataTable
              rows={statement.lines}
              rowKey={(l, i) => `${l.type}-${l.reference}-${i}`}
              emptyLabel="No activity in this period."
              columns={[
                { header: 'Date', cell: (l) => formatDate(l.date), muted: true },
                { header: 'Type', cell: (l) => l.type },
                { header: 'Reference', cell: (l) => l.reference, muted: true },
                { header: 'Amount', align: 'end', numeric: true, cell: (l) => formatMoney(l.amountMinor) },
                { header: 'Balance', align: 'end', numeric: true, cell: (l) => formatMoney(l.runningBalanceMinor) },
              ]}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
