'use client';

import { use, useEffect, useState, useRef } from 'react';
import clsx from 'clsx';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/use-toast';

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
  const user = getStoredUser();
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [count, setCount] = useState<StockCount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [barcode, setBarcode] = useState('');
  
  // For focusing the scanner input
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    adminFetch<{ data: StockCount }>(`/api/admin/inventory/counts/${id}`)
      .then((res) => setCount(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!user?.permissions.includes('inventory.count')) {
    return <p className="p-4 text-red-600">Permission denied: requires inventory.count</p>;
  }

  const handleStart = async () => {
    setError(null);
    try {
      await adminFetch(`/api/admin/inventory/counts/${id}/start`, { method: 'POST' });
      addToast('Count started successfully', 'success');
      load();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim() || count?.status !== 'IN_PROGRESS') return;

    try {
      await adminFetch(`/api/admin/inventory/counts/${id}/scan`, {
        method: 'POST',
        body: JSON.stringify({ barcode: barcode.trim() }),
      });
      addToast(`Scanned ${barcode.trim()}`, 'success', 2000);
      setBarcode('');
      load(); // Reload lines to show the scanned item incremented
      // Re-focus scanner input
      inputRef.current?.focus();
    } catch (err: any) {
      addToast(`Scan failed: ${err.message}`, 'error');
    }
  };

  const handleComplete = async () => {
    if (!confirm('Are you sure you want to complete this count? Any uncounted items will be ignored.')) return;
    try {
      await adminFetch(`/api/admin/inventory/counts/${id}/complete`, { method: 'POST' });
      addToast('Count completed successfully', 'success');
      router.push('/admin/inventory/counts');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  if (busy) return <p className="p-4 text-ink/50">Loading count sheet...</p>;
  if (!count) return <p className="p-4 text-red-600">Count not found.</p>;

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <div 
              key={t.id} 
              className={clsx(
                "p-4 rounded-md shadow-md text-sm cursor-pointer",
                t.type === 'error' ? "bg-red-50 text-red-800 border border-red-200" :
                t.type === 'success' ? "bg-green-50 text-green-800 border border-green-200" :
                "bg-blue-50 text-blue-800 border border-blue-200"
              )}
              onClick={() => removeToast(t.id)}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-ink">Stock Count {count.countNumber}</h1>
          <p className="text-sm text-ink/60">Status: {count.status.replace('_', ' ')}</p>
        </div>
        <div className="flex gap-2">
          {count.status === 'DRAFT' && (
            <button type="button" className="btn-primary" onClick={handleStart}>
              Start Count
            </button>
          )}
          {count.status === 'IN_PROGRESS' && (
            <button type="button" className="btn-secondary" onClick={handleComplete}>
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
          <p className="mt-2 text-xs text-ink/50">USB barcode scanners automatically submit on scan.</p>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-sand-200">
              <th className="px-4 py-2 font-semibold text-ink/50 uppercase text-xs">SKU</th>
              <th className="px-4 py-2 font-semibold text-ink/50 uppercase text-xs">Product</th>
              <th className="px-4 py-2 text-right font-semibold text-ink/50 uppercase text-xs">Expected</th>
              <th className="px-4 py-2 text-right font-semibold text-ink/50 uppercase text-xs">Counted</th>
              <th className="px-4 py-2 text-right font-semibold text-ink/50 uppercase text-xs">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand-200">
            {count.lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/50">
                  {count.status === 'DRAFT' ? 'Lines will be generated when count is started.' : 'No items found.'}
                </td>
              </tr>
            )}
            {count.lines.map((line) => {
              const variance = line.counted !== null && line.expected !== null 
                ? line.counted - line.expected 
                : null;
                
              return (
                <tr key={line.id} className="hover:bg-sand-50">
                  <td className="px-4 py-3 font-medium text-ink">{line.variant.sku}</td>
                  <td className="px-4 py-3 text-ink/70">
                    {line.variant.product.translations[0]?.name ?? 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-right text-ink/70 tabular-nums">
                    {line.expected ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-ink tabular-nums">
                    {line.counted ?? '-'}
                  </td>
                  <td className={clsx(
                    'px-4 py-3 text-right tabular-nums font-medium',
                    variance === null || variance === 0 ? 'text-ink/50' : variance > 0 ? 'text-green-600' : 'text-red-600'
                  )}>
                    {variance === null ? '-' : variance > 0 ? `+${variance}` : variance}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
