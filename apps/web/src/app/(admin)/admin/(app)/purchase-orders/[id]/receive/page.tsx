'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import type { Location } from '@/types/api';
import { DataTable } from '@/components/ui';

interface PurchaseOrder {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  status: string;
  items: Array<{
    id: string;
    variantId: string;
    quantityOrdered: number;
    quantityReceived: number;
    variant: {
      sku: string;
      product: { translations: { name: string }[] };
      size: string | null;
      color: string | null;
      lotTracked: boolean;
      tracksSerials: boolean;
    };
  }>;
}

export default function ReceiveGoodsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  // Receiving state: map of PO Item ID to quantity receiving in this session
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // 32-lots-batch-expiry-fefo.md / 158-serialized-unit-tracking.md — one lot
  // code + expiry per lot-tracked line, one serial number per unit per
  // serial-tracked line. Keyed by PO item id, same as receiveQtys.
  const [lotCodes, setLotCodes] = useState<Record<string, string>>({});
  const [expiresOn, setExpiresOn] = useState<Record<string, string>>({});
  const [serialsText, setSerialsText] = useState<Record<string, string>>({});

  useEffect(() => {
    adminFetch<PurchaseOrder>(`/admin/purchase-orders/${id}`)
      .then((res) => {
        setPo(res);
        const qtys: Record<string, number> = {};
        res.items.forEach(item => {
          // Pre-fill with remaining quantity
          qtys[item.id] = Math.max(0, item.quantityOrdered - item.quantityReceived);
        });
        setReceiveQtys(qtys);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load purchase order'))
      .finally(() => setBusy(false));

    adminFetch<Location[]>('/admin/inventory/locations')
      .then((result) => {
        setLocations(result);
        setLocationId(result.find((location) => location.isDefault)?.id ?? result[0]?.id ?? '');
      })
      .catch(() => undefined);
  }, [id]);

  const handleSubmit = async () => {
    if (!po) return;
    setSaving(true);
    setError(null);
    try {
      const receivingLines = po.items.filter((item) => receiveQtys[item.id] > 0);

      if (receivingLines.length === 0) {
        throw new Error('No items to receive. Set a quantity > 0.');
      }

      for (const item of receivingLines) {
        if (item.variant.lotTracked && !lotCodes[item.id]?.trim()) {
          throw new Error(`${item.variant.sku} is batch/lot tracked — enter a lot code before receiving it.`);
        }
        if (item.variant.tracksSerials) {
          const serials = parseSerials(serialsText[item.id]);
          if (serials.length !== receiveQtys[item.id]) {
            throw new Error(
              `${item.variant.sku} is serial tracked — ${receiveQtys[item.id]} unit(s) receiving but ${serials.length} serial number(s) given.`,
            );
          }
        }
      }

      const items = receivingLines.map((item) => ({
        purchaseOrderItemId: item.id,
        quantity: receiveQtys[item.id],
        lotCode: item.variant.lotTracked ? lotCodes[item.id]?.trim() : undefined,
        expiresOn: item.variant.lotTracked && expiresOn[item.id] ? expiresOn[item.id] : undefined,
        serials: item.variant.tracksSerials ? parseSerials(serialsText[item.id]) : undefined,
      }));

      await adminFetch(`/admin/purchase-orders/${id}/receive`, {
        method: 'POST',
        body: { items, notes: notes || undefined, locationId: locationId || undefined },
      });
      
      router.push(`/admin/purchase-orders/${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not receive goods');
      setSaving(false);
    }
  };

  if (busy) return <p className="text-sm text-neutral-900/60 p-4">Loading receiving sheet...</p>;
  if (error || !po) return <p className="notice notice-error">{error || 'Not found'}</p>;

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Receive Goods: PO {po.number}</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        Record stock entering the warehouse from {po.supplier.name}.
      </p>

      {error ? <p role="alert" className="notice notice-error mb-4">{error}</p> : null}

      <div className="card overflow-hidden mb-6">
        <DataTable
          rows={po.items}
          rowKey={(item) => item.id}
          emptyLabel="No order lines."
          columns={[
            {
              header: 'Item',
              cell: (item) => (
                <>
                  <div className="font-medium text-neutral-900">
                    {item.variant.product.translations[0]?.name || 'Unknown'}
                  </div>
                  <div className="text-xs text-neutral-900/60">
                    {[item.variant.size, item.variant.color].filter(Boolean).join(' / ')}
                  </div>
                </>
              ),
            },
            { header: 'SKU', cell: (item) => item.variant.sku, muted: true },
            {
              header: 'Ordered',
              align: 'end',
              numeric: true,
              cell: (item) => <span className="font-medium">{item.quantityOrdered}</span>,
            },
            {
              header: 'Previously Received',
              align: 'end',
              numeric: true,
              muted: true,
              cell: (item) => item.quantityReceived,
            },
            {
              header: 'Receiving Now',
              align: 'end',
              cell: (item) => {
                const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
                return (
                  <>
                    <input
                      type="number"
                      min="0"
                      className="field-input w-24 text-end font-medium"
                      value={receiveQtys[item.id] || 0}
                      onChange={(e) =>
                        setReceiveQtys({ ...receiveQtys, [item.id]: parseInt(e.target.value) || 0 })
                      }
                    />
                    {remaining > 0 && receiveQtys[item.id] !== remaining && (
                      <button
                        type="button"
                        className="mt-1 cursor-pointer text-xs text-neutral-900/60 hover:underline"
                        onClick={() => setReceiveQtys({ ...receiveQtys, [item.id]: remaining })}
                      >
                        Max: {remaining}
                      </button>
                    )}
                  </>
                );
              },
            },
          ]}
        />
      </div>

      {po.items.some((item) => receiveQtys[item.id] > 0 && (item.variant.lotTracked || item.variant.tracksSerials)) ? (
        <div className="card mb-6 space-y-5 p-6">
          <h2 className="text-sm font-medium text-neutral-900">Batch &amp; serial details</h2>
          {po.items
            .filter((item) => receiveQtys[item.id] > 0 && (item.variant.lotTracked || item.variant.tracksSerials))
            .map((item) => (
              <div key={item.id} className="border-t border-neutral-100 pt-4 first:border-t-0 first:pt-0">
                <p className="mb-2 text-sm font-medium text-neutral-900">
                  {item.variant.product.translations[0]?.name || item.variant.sku}
                  <span className="ms-2 text-xs font-normal text-neutral-900/60">{item.variant.sku}</span>
                </p>
                {item.variant.lotTracked ? (
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Lot / batch code</span>
                      <input
                        className="field-input"
                        value={lotCodes[item.id] ?? ''}
                        onChange={(e) => setLotCodes({ ...lotCodes, [item.id]: e.target.value })}
                        placeholder="e.g. LOT-2026-0912"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="field-label">Expires on (optional)</span>
                      <input
                        type="date"
                        className="field-input"
                        value={expiresOn[item.id] ?? ''}
                        onChange={(e) => setExpiresOn({ ...expiresOn, [item.id]: e.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
                {item.variant.tracksSerials ? (
                  <label className="block">
                    <span className="field-label">
                      Serial numbers — one per line, exactly {receiveQtys[item.id]} needed
                    </span>
                    <textarea
                      className="field-input w-full"
                      rows={Math.min(8, Math.max(3, receiveQtys[item.id]))}
                      value={serialsText[item.id] ?? ''}
                      onChange={(e) => setSerialsText({ ...serialsText, [item.id]: e.target.value })}
                      placeholder={'IMEI-0001\nIMEI-0002\n…'}
                    />
                    <span className="mt-1 block text-xs text-neutral-900/60">
                      {parseSerials(serialsText[item.id]).length} of {receiveQtys[item.id]} entered
                    </span>
                  </label>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}

      <div className="card p-6 max-w-2xl">
        {locations.length > 1 ? (
          <div className="mb-6">
            <label htmlFor="receipt-location" className="block mb-2 text-sm font-medium text-neutral-900">
              Received at
            </label>
            <select
              id="receipt-location"
              className="field-input w-full"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.type === 'WAREHOUSE' && !location.retailBrandId ? ' (org warehouse)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <label htmlFor="receipt-notes" className="block mb-2 text-sm font-medium text-neutral-900">
          Receipt Notes (optional)
        </label>
        <textarea
          id="receipt-notes"
          className="field-input w-full mb-6"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. 2 boxes damaged in transit"
        />
        
        <div className="flex justify-end gap-3">
          <button 
            type="button" 
            onClick={() => router.back()}
            disabled={saving}
            className="px-4 py-2 bg-transparent text-neutral-900/70 hover:text-neutral-900 font-medium"
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Receiving...' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </>
  );
}

function parseSerials(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[\n,]/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}
