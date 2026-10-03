'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatDateShort } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import type { Location } from '@/types/api';
import { PageHeader, ConfirmDialog } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import { Select } from '@/components/ui/select';

interface UnitHistory {
  serialNumber: string;
  status: 'IN_STOCK' | 'SOLD' | 'RETURNED' | 'RMA_TO_SUPPLIER' | 'WRITTEN_OFF';
  soldOn: string | null;
  orderId: string | null;
  orderNumber: string | null;
  warrantyEndsOn: string | null;
}

/**
 * 158-serialized-unit-tracking.md WO-158.5/158.6. Sell/return/write-off are
 * the manual staff actions this document scopes deliberately — an ordinary
 * checkout does not auto-select which physical unit went out (DECISIONS.md
 * ADR-068), so a staff member reconciles the specific serial against the
 * order here after the sale is recorded.
 */
export default function SerialDetailPage({ params }: { params: Promise<{ serialNumber: string }> }) {
  const { serialNumber } = use(params);
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [unit, setUnit] = useState<UnitHistory | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orderId, setOrderId] = useState('');
  const [returnLocationId, setReturnLocationId] = useState('');
  const [writeOffNote, setWriteOffNote] = useState('');
  const [confirmingWriteOff, setConfirmingWriteOff] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    adminFetch<UnitHistory>(`/admin/inventory/serials/${encodeURIComponent(serialNumber)}/history`)
      .then(setUnit)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load this serial number'))
      .finally(() => setBusy(false));
  }

  useEffect(load, [serialNumber]);

  useEffect(() => {
    adminFetch<Location[]>('/admin/inventory/locations')
      .then((result) => {
        setLocations(result);
        setReturnLocationId(result.find((l) => l.isDefault)?.id ?? result[0]?.id ?? '');
      })
      .catch(() => undefined);
  }, []);

  async function sell() {
    if (!orderId.trim()) return;
    setSubmitting(true);
    try {
      await adminFetch('/admin/inventory/serials/sell', { method: 'POST', body: { serialNumber, orderId: orderId.trim() } });
      addToast('Sold against that order.', 'success');
      setOrderId('');
      load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not record the sale', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function returnUnit() {
    if (!orderId.trim() || !returnLocationId) return;
    setSubmitting(true);
    try {
      await adminFetch('/admin/inventory/serials/return', {
        method: 'POST',
        body: { serialNumber, orderId: orderId.trim(), locationId: returnLocationId },
      });
      addToast('Return recorded.', 'success');
      setOrderId('');
      load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not record the return', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function writeOff() {
    setSubmitting(true);
    try {
      await adminFetch('/admin/inventory/serials/write-off', {
        method: 'POST',
        body: { serialNumber, note: writeOffNote.trim() || undefined },
      });
      addToast('Unit written off.', 'success');
      setConfirmingWriteOff(false);
      setWriteOffNote('');
      load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not write off this unit', 'error');
      setConfirmingWriteOff(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading serial number…</p>;
  }

  if (error && !unit) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!unit) return null;

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      <PageHeader
        title={unit.serialNumber}
        description={<StatusBadge status={unit.status} />}
        action={
          <Link href="/admin/inventory/serials" className="btn-secondary">
            All serial numbers
          </Link>
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card mb-6 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <p className="field-label">Sold on</p>
          <p className="text-sm text-neutral-900">{unit.soldOn ? formatDateShort(unit.soldOn) : '—'}</p>
        </div>
        <div>
          <p className="field-label">Order</p>
          <p className="text-sm text-neutral-900">
            {unit.orderId ? (
              <Link href={`/admin/orders/${unit.orderId}`} className="text-accent-hover hover:underline">
                {unit.orderNumber}
              </Link>
            ) : (
              '—'
            )}
          </p>
        </div>
        <div>
          <p className="field-label">Warranty ends</p>
          <p className="text-sm text-neutral-900">{unit.warrantyEndsOn ? formatDateShort(unit.warrantyEndsOn) : '—'}</p>
        </div>
      </div>

      {unit.status === 'IN_STOCK' ? (
        <div className="card mb-6 max-w-xl space-y-4 p-4">
          <div>
            <h2 className="mb-2 text-sm font-medium text-neutral-900">Sell against an order</h2>
            <div className="flex items-end gap-3">
              <label className="block flex-1">
                <span className="field-label">Order ID</span>
                <input className="field-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
              </label>
              <button type="button" onClick={() => void sell()} disabled={submitting || !orderId.trim()} className="btn-primary">
                Sell
              </button>
            </div>
          </div>
          <div className="border-t border-neutral-100 pt-4">
            <h2 className="mb-2 text-sm font-medium text-neutral-900">Write off</h2>
            <div className="flex items-end gap-3">
              <label className="block flex-1">
                <span className="field-label">Reason (optional)</span>
                <input className="field-input" value={writeOffNote} onChange={(e) => setWriteOffNote(e.target.value)} placeholder="Theft, damage, lost…" />
              </label>
              <button type="button" onClick={() => setConfirmingWriteOff(true)} disabled={submitting} className="btn-danger">
                Write off
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unit.status === 'SOLD' ? (
        <div className="card mb-6 max-w-xl p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-900">Return this unit</h2>
          <p className="mb-3 text-xs text-neutral-900/60">
            Refused unless the order id matches exactly what it was sold on.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Order ID</span>
              <input
                className="field-input"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder={unit.orderId ?? ''}
              />
            </label>
            {locations.length > 1 ? (
              <div>
                <span className="field-label">Returned to</span>
                <Select
                  label="Returned to"
                  value={returnLocationId}
                  onChange={setReturnLocationId}
                  options={locations.map((location) => ({ value: location.id, label: location.name }))}
                />
              </div>
            ) : null}
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void returnUnit()}
              disabled={submitting || !orderId.trim() || !returnLocationId}
              className="btn-secondary"
            >
              Record return
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmingWriteOff}
        onClose={() => setConfirmingWriteOff(false)}
        onConfirm={writeOff}
        title={`Write off ${unit.serialNumber}?`}
        description="This removes it from sellable stock. It cannot be sold or returned again from here."
        confirmLabel="Write off unit"
        busy={submitting}
      />
    </>
  );
}
