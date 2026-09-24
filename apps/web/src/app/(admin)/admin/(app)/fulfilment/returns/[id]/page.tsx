'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-client';
import { formatDateTime } from '@newax/shared';
import { StatusBadge } from '@/components/common/status-badge';

interface ReturnItem {
  id: string;
  quantity: number;
  restockable: boolean | null;
  reason: { translations: Array<{ locale: string; label: string }> };
  orderItem: { nameEn: string; sku: string | null };
}

interface ReturnDetail {
  id: string;
  number: string;
  status: string;
  resolution: string | null;
  customerNote: string | null;
  staffNote: string | null;
  photoUrls: string[];
  refundAmount: number | null;
  requestedAt: string;
  order: { id: string; number: string };
  items: ReturnItem[];
}

/** WO-6.8's own "inspection sheet" — the packing-and-inspection screen the doc says gets used on a phone in a stockroom. */
export default function ReturnDetailPage() {
  const params = useParams<{ id: string }>();
  const [request, setRequest] = useState<ReturnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restockable, setRestockable] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const data = await adminFetch<ReturnDetail>(`/admin/fulfilment/returns/${params.id}`);
      setRequest(data);
      setRestockable(Object.fromEntries(data.items.map((item) => [item.id, true])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this return');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    try {
      await adminFetch(`/admin/fulfilment/returns/${params.id}${path}`, { method: 'POST', body });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this return');
    } finally {
      setBusy(false);
    }
  }

  async function inspect() {
    await act('/inspect', {
      items: Object.entries(restockable).map(([itemId, value]) => ({ itemId, restockable: value })),
    });
  }

  async function resolve(resolution: string) {
    if (resolution === 'REFUND') {
      window.alert('Process the refund via Payments first (Admin → Payment approvals), then confirm here.');
    }
    const refundAmount = resolution === 'REFUND' ? Number(window.prompt('Refund amount, in Rs', '0')) * 100 : undefined;
    await act('/resolve', { resolution, refundAmount });
  }

  if (!request) {
    return error ? <p role="alert" className="notice notice-error">{error}</p> : <div className="skeleton h-64 rounded-md" />;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">{request.number}</h1>
          <p className="text-sm text-neutral-900/60">
            Order{' '}
            <Link href={`/admin/orders/${request.order.id}`} className="text-accent-hover hover:underline">
              {request.order.number}
            </Link>{' '}
            · requested {formatDateTime(request.requestedAt)}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      {request.customerNote ? (
        <p className="mb-6 rounded-md bg-neutral-50 p-4 text-sm text-neutral-900">
          <span className="font-medium">Customer note: </span>
          {request.customerNote}
        </p>
      ) : null}

      <table className="table-flat mb-6 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-900/60">
            <th className="pb-2">Item</th>
            <th className="pb-2">Reason</th>
            <th className="pb-2 text-end">Qty</th>
            {request.status === 'RECEIVED' ? <th className="pb-2 text-end">Restockable</th> : <th className="pb-2 text-end">Outcome</th>}
          </tr>
        </thead>
        <tbody>
          {request.items.map((item) => (
            <tr key={item.id}>
              <td className="py-1.5">
                {item.orderItem.nameEn}
                {item.orderItem.sku ? <span className="text-neutral-900/60"> · {item.orderItem.sku}</span> : null}
              </td>
              <td className="py-1.5 text-neutral-900/60">
                {item.reason.translations.find((t) => t.locale === 'en')?.label ?? '—'}
              </td>
              <td className="py-1.5 text-end tabular-nums">{item.quantity}</td>
              <td className="py-1.5 text-end">
                {request.status === 'RECEIVED' ? (
                  <input
                    type="checkbox"
                    className="field-check"
                    checked={restockable[item.id] ?? true}
                    onChange={(event) => setRestockable((current) => ({ ...current, [item.id]: event.target.checked }))}
                  />
                ) : item.restockable === null ? (
                  '—'
                ) : item.restockable ? (
                  'Restocked'
                ) : (
                  'Written off'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-2">
        {request.status === 'REQUESTED' ? (
          <>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void act('/approve')}>
              Approve
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => void act('/reject')}>
              Reject
            </button>
          </>
        ) : null}
        {request.status === 'APPROVED' ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void act('/in-transit')}>
            Mark in transit
          </button>
        ) : null}
        {(request.status === 'APPROVED' || request.status === 'IN_TRANSIT') ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void act('/received')}>
            Mark received
          </button>
        ) : null}
        {request.status === 'RECEIVED' ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void inspect()}>
            Save inspection
          </button>
        ) : null}
        {request.status === 'INSPECTED' ? (
          <>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void resolve('REFUND')}>
              Refund
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void resolve('STORE_CREDIT')}>
              Store credit
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void resolve('EXCHANGE')}>
              Exchange
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void resolve('REPAIR')}>
              Repair
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
