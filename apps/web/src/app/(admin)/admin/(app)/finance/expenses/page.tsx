'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoney } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, MetricStrip, PageHeader } from '@/components/ui';

interface ExpenseCategory {
  id: string;
  key: string;
  name: string;
  isDirect: boolean;
  isActive: boolean;
}

type ExpenseRecurrence = 'NONE' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

const RECURRENCE_LABEL: Record<ExpenseRecurrence, string> = {
  NONE: 'One-off',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  currency: string;
  description: string;
  incurredAt: string;
  paidAt: string | null;
  payee: string | null;
  receiptUrl: string | null;
  recurrence: ExpenseRecurrence;
  recurringFromId: string | null;
  category: ExpenseCategory;
}

interface ExpenseSummary {
  totals: {
    amount: number;
    count: number;
    directAmount: number;
    operatingAmount: number;
    unpaidAmount: number;
    unpaidCount: number;
  };
}

/**
 * Record expenses and see what the shop is spending. Categories — what an
 * expense can BE — are a separate screen (Law 5: one job each); this one's
 * job is the transaction: log a cost, see the running total.
 */
export default function ExpensesPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState('');
  const [paidFilter, setPaidFilter] = useState<'' | 'true' | 'false'>('');
  const [search, setSearch] = useState('');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [incurredAt, setIncurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [paid, setPaid] = useState(true);
  const [payee, setPayee] = useState('');
  const [recurrence, setRecurrence] = useState<ExpenseRecurrence>('NONE');
  const [recording, setRecording] = useState(false);
  const [uploadingReceiptFor, setUploadingReceiptFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const query = {
        categoryId: categoryFilter || undefined,
        paid: paidFilter || undefined,
        q: search || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
      };
      const [expensesRes, summaryRes, categoriesRes] = await Promise.all([
        adminFetch<{ data: Expense[] }>('/admin/finance/expenses', { query }),
        adminFetch<ExpenseSummary>('/admin/finance/expenses/summary'),
        adminFetch<{ data: ExpenseCategory[] }>('/admin/finance/expense-categories'),
      ]);
      setExpenses(expensesRes.data);
      setSummary(summaryRes);
      setCategories(categoriesRes.data.filter((c) => c.isActive));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load expenses');
    } finally {
      setBusy(false);
    }
  }, [categoryFilter, paidFilter, search, fromFilter, toFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pre-fills the filters when arriving from the analytics screen's
  // by-category drill-through (?categoryId=&from=&to=) — read post-mount,
  // not as the initial state, so server and first client render still match.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('categoryId');
    const from = params.get('from');
    const to = params.get('to');
    if (category) setCategoryFilter(category);
    if (from) setFromFilter(from);
    if (to) setToFilter(to);
  }, []);

  async function recordExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!categoryId) {
      addToast('Choose a category first.', 'error');
      return;
    }
    setRecording(true);
    try {
      await adminFetch('/admin/finance/expenses', {
        method: 'POST',
        body: {
          categoryId,
          amount: Math.round(Number(amount) * 100),
          description: description.trim(),
          incurredAt: new Date(incurredAt).toISOString(),
          paidAt: paid ? new Date().toISOString() : undefined,
          payee: payee.trim() || undefined,
          recurrence: recurrence === 'NONE' ? undefined : recurrence,
        },
      });
      setAmount('');
      setDescription('');
      setPayee('');
      setRecurrence('NONE');
      addToast(
        recurrence === 'NONE' ? 'Expense recorded.' : 'Expense recorded. Future instances generate automatically.',
        'success',
      );
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not record the expense', 'error');
    } finally {
      setRecording(false);
    }
  }

  async function deleteExpense(expense: Expense) {
    try {
      await adminFetch(`/admin/finance/expenses/${expense.id}`, { method: 'DELETE' });
      addToast('Expense deleted.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not delete the expense', 'error');
    }
  }

  async function uploadReceipt(expense: Expense, file: File) {
    setUploadingReceiptFor(expense.id);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await adminFetch(`/admin/finance/expenses/${expense.id}/receipt`, { method: 'POST', formData });
      addToast('Receipt attached.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not attach the receipt', 'error');
    } finally {
      setUploadingReceiptFor(null);
    }
  }

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              className={cn(
                'w-full cursor-pointer rounded-md border p-4 text-start text-sm shadow-md',
                t.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : t.type === 'success'
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-blue-200 bg-blue-50 text-blue-800',
              )}
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label={`Dismiss: ${t.message}`}
            >
              {t.message}
            </button>
          ))}
        </div>
      )}

      <PageHeader
        title="Expenses"
        description="What the shop spends, grouped by category and gross-profit line."
        action={
          <div className="flex gap-2">
            <Link href="/admin/finance/expenses/analytics" className="btn-secondary">
              Analytics
            </Link>
            <Link href="/admin/finance/expenses/categories" className="btn-secondary">
              Categories
            </Link>
          </div>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mb-6">
          <MetricStrip
            label="Expense summary"
            items={[
              { key: 'total', label: 'Total', value: formatMoney(summary.totals.amount) },
              { key: 'direct', label: 'Direct', value: formatMoney(summary.totals.directAmount) },
              { key: 'operating', label: 'Operating', value: formatMoney(summary.totals.operatingAmount) },
              {
                key: 'unpaid',
                label: 'Unpaid',
                value: `${formatMoney(summary.totals.unpaidAmount)} (${summary.totals.unpaidCount})`,
              },
            ]}
          />
        </div>
      ) : null}

      <form
        onSubmit={recordExpense}
        className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="block lg:col-span-2">
          <span className="field-label">Category</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="field-input"
            required
          >
            <option value="">Choose…</option>
            {(categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Amount (Rs)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="field-input"
            required
          />
        </label>
        <label className="block lg:col-span-2">
          <span className="field-label">Description</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="field-input"
            required
          />
        </label>
        <label className="block">
          <span className="field-label">Incurred</span>
          <input
            type="date"
            value={incurredAt}
            onChange={(event) => setIncurredAt(event.target.value)}
            className="field-input"
            required
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-neutral-900/70">
          <input
            type="checkbox"
            checked={paid}
            onChange={(event) => setPaid(event.target.checked)}
            className="field-check"
          />
          Already paid
        </label>
        <label className="block lg:col-span-2">
          <span className="field-label">Payee (optional)</span>
          <input
            value={payee}
            onChange={(event) => setPayee(event.target.value)}
            className="field-input"
          />
        </label>
        <label className="block">
          <span className="field-label">Repeats</span>
          <select
            value={recurrence}
            onChange={(event) => setRecurrence(event.target.value as ExpenseRecurrence)}
            className="field-input"
          >
            {(Object.keys(RECURRENCE_LABEL) as ExpenseRecurrence[]).map((value) => (
              <option key={value} value={value}>
                {RECURRENCE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end lg:col-span-3">
          <button type="submit" disabled={recording} className="btn-primary">
            {recording ? 'Recording…' : 'Record expense'}
          </button>
        </div>
      </form>

      <div role="group" aria-label="Filter expenses" className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="field-input w-auto"
          aria-label="Category"
        >
          <option value="">All categories</option>
          {(categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={paidFilter}
          onChange={(event) => setPaidFilter(event.target.value as '' | 'true' | 'false')}
          className="field-input w-auto"
          aria-label="Paid status"
        >
          <option value="">Paid and unpaid</option>
          <option value="true">Paid only</option>
          <option value="false">Unpaid only</option>
        </select>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search description, payee, reference…"
          className="field-input w-auto flex-1"
          aria-label="Search"
        />
        <input
          type="date"
          value={fromFilter}
          onChange={(event) => setFromFilter(event.target.value)}
          className="field-input w-auto"
          aria-label="From date"
        />
        <input
          type="date"
          value={toFilter}
          onChange={(event) => setToFilter(event.target.value)}
          className="field-input w-auto"
          aria-label="To date"
        />
      </div>

      <div className="overflow-hidden">
        <DataTable
          rows={expenses}
          loading={busy && !expenses}
          rowKey={(expense) => expense.id}
          emptyLabel="No expenses match those filters."
          columns={[
            {
              header: 'Date',
              muted: true,
              cell: (e) => (
                <>
                  {formatDate(e.incurredAt)}
                  {e.recurrence !== 'NONE' ? (
                    <span className="ms-1 text-xs text-neutral-900/60">({RECURRENCE_LABEL[e.recurrence]})</span>
                  ) : null}
                  {e.recurringFromId ? <span className="ms-1 text-xs text-neutral-900/60">(auto)</span> : null}
                </>
              ),
            },
            { header: 'Description', cell: (e) => e.description },
            { header: 'Category', muted: true, cell: (e) => e.category.name },
            {
              header: 'Amount',
              numeric: true,
              align: 'end',
              cell: (e) => formatMoney(e.amount),
            },
            {
              header: 'Status',
              cell: (e) => (e.paidAt ? 'Paid' : 'Unpaid'),
              muted: true,
            },
            {
              header: 'Receipt',
              cell: (e) =>
                e.receiptUrl ? (
                  <a
                    href={e.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-neutral-900/70 underline hover:text-neutral-900"
                  >
                    View
                  </a>
                ) : (
                  <label className="cursor-pointer text-xs text-neutral-900/60 underline hover:text-neutral-900">
                    {uploadingReceiptFor === e.id ? 'Uploading…' : 'Attach'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif,application/pdf"
                      disabled={uploadingReceiptFor === e.id}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) void uploadReceipt(e, file);
                      }}
                      className="sr-only"
                    />
                  </label>
                ),
            },
            {
              header: '',
              align: 'end',
              cell: (e) => (
                <button
                  type="button"
                  onClick={() => void deleteExpense(e)}
                  className="text-xs text-neutral-900/60 hover:text-neutral-900"
                >
                  Delete
                </button>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
