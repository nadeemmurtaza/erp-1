'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog, DataTable } from '@/components/ui';
import { useAdminSession } from '@/components/admin/session';

interface CountLine {
  id: string;
  variantId: string;
  expected: number | null;
  counted: number | null;
  variant: {
    sku: string;
    product: {
      translations: Array<{ name: string }>;
    };
  };
}

interface StockCount {
  id: string;
  countNumber: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  lines: CountLine[];
}

export default function CountSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAdminSession();
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [count, setCount] = useState<StockCount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [barcode, setBarcode] = useState('');
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  
  // For focusing the scanner input
  const inputRef = useRef<HTMLInputElement>(null);

  // useCallback, so the effect can depend on it honestly. It was a plain
  // function rebuilt every render, which meant listing it in the dependency
  // array would have looped — so it was left out, and the lint warning that
  // flagged that stood for months.
  const load = useCallback(() => {
    adminFetch<{ data: StockCount }>(`/admin/inventory/counts/${id}`)
      .then((res) => setCount(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the count'))
      .finally(() => setBusy(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!can('inventory.count')) {
    return <p role="alert" className="notice notice-error">
        Permission denied: requires inventory.count
      </p>;
  }

  const handleStart = async () => {
    setError(null);
    try {
      await adminFetch(`/admin/inventory/counts/${id}/start`, { method: 'POST' });
      addToast('Count started successfully', 'success');
      load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not start this count', 'error');
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim() || count?.status !== 'IN_PROGRESS') return;

    try {
      await adminFetch(`/admin/inventory/counts/${id}/scan`, {
        method: 'POST',
        body: JSON.stringify({ barcode: barcode.trim() }),
      });
      addToast(`Scanned ${barcode.trim()}`, 'success', 2000);
      setBarcode('');
      load(); // Reload lines to show the scanned item incremented
      // Re-focus scanner input
      inputRef.current?.focus();
    } catch (cause) {
      addToast(`Scan failed: ${cause instanceof Error ? cause.message : 'unknown error'}`, 'error');
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await adminFetch(`/admin/inventory/counts/${id}/complete`, { method: 'POST' });
      addToast('Count completed successfully', 'success');
      router.push('/admin/inventory/counts');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not complete this count', 'error');
      setCompleting(false);
      setConfirmingComplete(false);
    }
  };

  if (busy) return <p className="p-4 text-neutral-900/60">Loading count sheet...</p>;
  if (!count) return <p className="p-4 text-red-600">Count not found.</p>;

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-toast flex flex-col gap-2">
          {toasts.map((t) => (
            <button 
              key={t.id} 
              className={cn(
                "w-full p-4 rounded-md shadow-md text-sm text-start cursor-pointer",
                t.type === 'error' ? "bg-red-50 text-red-800 border border-red-200" :
                t.type === 'success' ? "bg-green-50 text-green-800 border border-green-200" :
                "bg-blue-50 text-blue-800 border border-blue-200"
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

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Stock Count {count.countNumber}</h1>
          <p className="text-sm text-neutral-900/60">Status: {count.status.replace('_', ' ')}</p>
        </div>
        <div className="flex gap-2">
          {count.status === 'DRAFT' && (
            <button type="button" className="btn-primary" onClick={handleStart}>
              Start Count
            </button>
          )}
          {count.status === 'IN_PROGRESS' && (
            <button type="button" className="btn-secondary" onClick={() => setConfirmingComplete(true)}>
              Complete Count
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {count.status === 'IN_PROGRESS' && (
        <div className="card mb-6 p-4">
          <form onSubmit={handleScan} className="flex gap-3 max-w-sm">
            <input
              ref={inputRef}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- a stock count is a scan loop: the operator holds a scanner, not a mouse, and every scan must land in this field. ACT-1 / HEU-7.
              autoFocus
              type="text"
              className="field-input w-full"
              placeholder="Scan barcode..."
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Enter
            </button>
          </form>
          <p className="mt-2 text-xs text-neutral-900/60">USB barcode scanners automatically submit on scan.</p>
        </div>
      )}

      <div className="card overflow-hidden">
        <DataTable
          rows={count.lines}
          rowKey={(line) => line.id}
          emptyLabel={
            count.status === 'DRAFT' ? 'Lines will be generated when count is started.' : 'No items found.'
          }
          columns={[
            {
              header: 'SKU',
              cell: (line) => line.variant.sku,
              className: 'font-medium text-neutral-900',
            },
            {
              header: 'Product',
              cell: (line) => line.variant.product.translations[0]?.name ?? 'Unknown',
              muted: true,
            },
            {
              header: 'Expected',
              align: 'end',
              numeric: true,
              cell: (line) => line.expected ?? '-',
              muted: true,
            },
            {
              header: 'Counted',
              align: 'end',
              numeric: true,
              cell: (line) => line.counted ?? '-',
              className: 'font-medium text-neutral-900',
            },
            {
              header: 'Variance',
              align: 'end',
              numeric: true,
              cell: (line) => {
                const variance =
                  line.counted !== null && line.expected !== null ? line.counted - line.expected : null;
                return (
                  <span
                    className={cn(
                      'font-medium',
                      variance === null || variance === 0
                        ? 'text-neutral-900/60'
                        : variance > 0
                          ? 'text-green-600'
                          : 'text-red-600',
                    )}
                  >
                    {variance === null ? '-' : variance > 0 ? `+${variance}` : variance}
                  </span>
                );
              },
            },
          ]}
        />
      </div>

      <ConfirmDialog
        open={confirmingComplete}
        onClose={() => setConfirmingComplete(false)}
        onConfirm={handleComplete}
        title="Complete this count?"
        description="Any line left uncounted is ignored, and the count can no longer be edited or re-posted."
        confirmLabel="Complete count"
        busy={completing}
      />
    </>
  );
}
