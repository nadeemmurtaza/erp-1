'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, PageHeader } from '@/components/ui';

interface ExpenseCategory {
  id: string;
  key: string;
  name: string;
  isDirect: boolean;
  isActive: boolean;
  order: number;
  expenseCount: number;
}

/**
 * Expense categories — one page, one job (Law 5): decide what an expense can
 * be classified as, and whether it sits above or below the gross-profit
 * line. Recording expenses themselves is the parent screen.
 */
export default function ExpenseCategoriesPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newIsDirect, setNewIsDirect] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch<{ data: ExpenseCategory[] }>('/admin/finance/expense-categories');
      setCategories(res.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load expense categories');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCategory(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await adminFetch('/admin/finance/expense-categories', {
        method: 'POST',
        body: { key: newKey.trim(), name: newName.trim(), isDirect: newIsDirect },
      });
      setNewKey('');
      setNewName('');
      setNewIsDirect(false);
      addToast('Category created.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create the category', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(category: ExpenseCategory) {
    try {
      await adminFetch(`/admin/finance/expense-categories/${category.id}`, {
        method: 'PATCH',
        body: { isActive: !category.isActive },
      });
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not update the category', 'error');
    }
  }

  async function deleteCategory(category: ExpenseCategory) {
    try {
      await adminFetch(`/admin/finance/expense-categories/${category.id}`, { method: 'DELETE' });
      addToast('Category deleted.', 'success');
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not delete the category', 'error');
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
        title="Expense categories"
        description="Direct costs sit above the gross-profit line; operating costs sit below it."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <form onSubmit={createCategory} className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Key</span>
          <input
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            placeholder="courier_charges"
            pattern="[a-z0-9_]+"
            className="field-input"
            required
          />
        </label>
        <label className="block">
          <span className="field-label">Name</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Courier charges"
            className="field-input"
            required
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-neutral-900/70">
          <input
            type="checkbox"
            checked={newIsDirect}
            onChange={(event) => setNewIsDirect(event.target.checked)}
            className="field-check"
          />
          Direct cost
        </label>
        <button type="submit" disabled={creating} className="btn-primary">
          {creating ? 'Adding…' : 'Add category'}
        </button>
      </form>

      <div className="overflow-hidden">
        <DataTable
          rows={categories}
          loading={busy && !categories}
          rowKey={(category) => category.id}
          emptyLabel="No expense categories yet."
          columns={[
            { header: 'Key', cell: (c) => <span className="font-mono text-xs">{c.key}</span> },
            { header: 'Name', cell: (c) => c.name },
            {
              header: 'Line',
              cell: (c) => (c.isDirect ? 'Direct' : 'Operating'),
              muted: true,
            },
            { header: 'Expenses', numeric: true, align: 'end', cell: (c) => c.expenseCount },
            {
              header: 'Status',
              cell: (c) => (
                <button
                  type="button"
                  onClick={() => void toggleActive(c)}
                  className="text-xs text-neutral-900/60 hover:text-neutral-900"
                >
                  {c.isActive ? 'Active' : 'Inactive'}
                </button>
              ),
            },
            {
              header: '',
              align: 'end',
              cell: (c) =>
                c.expenseCount === 0 ? (
                  <button
                    type="button"
                    onClick={() => void deleteCategory(c)}
                    className="text-xs text-neutral-900/60 hover:text-neutral-900"
                  >
                    Delete
                  </button>
                ) : null,
            },
          ]}
        />
      </div>
    </>
  );
}
