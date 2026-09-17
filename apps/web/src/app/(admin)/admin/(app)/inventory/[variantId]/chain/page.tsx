'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/cn';
import { adminFetch } from '@/lib/admin-client';

interface ChainStatus {
  variant: {
    id: string;
    sku: string;
    label: string | null;
    stock: number;
    producedInHouse: boolean;
    reorderPoint: number | null;
  };
  stock: Array<{ locationId: string; locationName: string; locationCode: string; quantity: number }>;
  openPurchaseOrders: Array<{
    purchaseOrderId: string;
    number: string;
    status: string;
    expectedAt: string | null;
    supplier: { id: string; name: string } | null;
    quantityOrdered: number;
    quantityReceived: number;
  }>;
  openWorkOrders: Array<{
    id: string;
    number: string;
    status: string;
    source: string;
    quantityOrdered: number;
    quantityCompleted: number;
  }>;
  pendingOrderLines: Array<{
    orderItemId: string;
    orderId: string;
    orderNumber: string;
    orderStatus: string;
    placedAt: string;
    quantity: number;
    stitchingJob: { number: string; stage: string; dueAt: string | null } | null;
  }>;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {children}
    </div>
  );
}

export default function VariantChainPage({ params }: { params: Promise<{ variantId: string }> }) {
  const { variantId } = use(params);

  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    adminFetch<ChainStatus>(`/admin/inventory/${variantId}/chain`)
      .then(setChain)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the supply chain view'))
      .finally(() => setBusy(false));
  }, [variantId]);

  if (busy) return <p className="text-sm text-neutral-900/50">Loading...</p>;
  if (error) return <p role="alert" className="card p-4 text-sm text-red-700">{error}</p>;
  if (!chain) return null;

  const { variant } = chain;

  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-neutral-900">{variant.sku}</h1>
        {variant.label ? <span className="text-sm text-neutral-900/60">{variant.label}</span> : null}
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium',
            variant.producedInHouse ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-900/70',
          )}
        >
          {variant.producedInHouse ? 'Produced in-house' : 'Externally sourced'}
        </span>
      </div>
      <p className="mb-6 text-sm text-neutral-900/60">
        Everything in flight for this SKU: stock on hand, purchase orders, work orders and orders still owed to customers.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={`Stock on hand — ${variant.stock} total`}>
          {chain.stock.length === 0 ? (
            <p className="text-sm text-neutral-900/50">No stock recorded at any location.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {chain.stock.map((row) => (
                <li key={row.locationId} className="flex justify-between py-2">
                  <span className="text-neutral-900/70">{row.locationName} ({row.locationCode})</span>
                  <span className="font-medium text-neutral-900">{row.quantity}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Open purchase orders">
          {chain.openPurchaseOrders.length === 0 ? (
            <p className="text-sm text-neutral-900/50">Nothing in flight from a supplier.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {chain.openPurchaseOrders.map((po) => (
                <li key={po.purchaseOrderId} className="py-2">
                  <div className="flex justify-between">
                    <Link href={`/admin/purchase-orders/${po.purchaseOrderId}`} className="font-medium text-accent-hover hover:underline">
                      {po.number}
                    </Link>
                    <span className="text-neutral-900/60">{po.status}</span>
                  </div>
                  <div className="text-neutral-900/60">
                    {po.supplier?.name ?? 'No supplier'} — {po.quantityReceived}/{po.quantityOrdered} received
                    {po.expectedAt ? ` — expected ${new Date(po.expectedAt).toLocaleDateString()}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Open work orders">
          {chain.openWorkOrders.length === 0 ? (
            <p className="text-sm text-neutral-900/50">Nothing in production.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {chain.openWorkOrders.map((wo) => (
                <li key={wo.id} className="flex justify-between py-2">
                  <span className="font-medium text-neutral-900">{wo.number}</span>
                  <span className="text-neutral-900/60">
                    {wo.status} ({wo.source.toLowerCase()}) — {wo.quantityCompleted}/{wo.quantityOrdered}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Order lines still owed to a customer">
          {chain.pendingOrderLines.length === 0 ? (
            <p className="text-sm text-neutral-900/50">No open orders on this SKU.</p>
          ) : (
            <ul className="divide-y divide-neutral-100 text-sm">
              {chain.pendingOrderLines.map((line) => (
                <li key={line.orderItemId} className="py-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-neutral-900">{line.orderNumber}</span>
                    <span className="text-neutral-900/60">{line.orderStatus} — qty {line.quantity}</span>
                  </div>
                  {line.stitchingJob ? (
                    <div className="text-neutral-900/60">
                      Stitching {line.stitchingJob.number}: {line.stitchingJob.stage.toLowerCase()}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
