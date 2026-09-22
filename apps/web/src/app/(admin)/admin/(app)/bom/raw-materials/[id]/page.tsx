'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTime, formatMoney, formatQuantity, UNIT_LABELS, type RawMaterialUnit } from '@newax/shared';
import { adminFetch, getStoredUser } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, MetricStrip, PageHeader } from '@/components/ui';

const RAW_MATERIAL_KINDS = ['fabric', 'trim', 'packaging', 'consumable'] as const;
type RawMaterialKind = (typeof RAW_MATERIAL_KINDS)[number];

interface StockMovementRow {
  id: string;
  delta: number;
  resultingStock: number;
  reason: string;
  unitCost?: number;
  note: string | null;
  createdAt: string;
}

interface RawMaterialDetail {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  kind: RawMaterialKind;
  unit: RawMaterialUnit;
  unitScale: number;
  isActive: boolean;
  stockBase: number;
  stockDisplay: number;
  costPrice?: number;
  notes: string | null;
  recentMovements: StockMovementRow[];
}

export default function RawMaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const canManage = getStoredUser()?.permissions.includes('bom.manage') ?? false;

  const [material, setMaterial] = useState<RawMaterialDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<RawMaterialKind>('fabric');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  function load() {
    adminFetch<RawMaterialDetail>(`/admin/bom/raw-materials/${id}`)
      .then((row) => {
        setMaterial(row);
        setName(row.name);
        setKind(row.kind);
        setNotes(row.notes ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load raw material'))
      .finally(() => setBusy(false));
  }

  useEffect(load, [id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await adminFetch<RawMaterialDetail>(`/admin/bom/raw-materials/${id}`, {
        method: 'PATCH',
        body: { name: name.trim(), kind, notes: notes.trim() || undefined },
      });
      setMaterial((current) => (current ? { ...current, ...updated } : updated));
      addToast('Saved.', 'success');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save changes', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!material || !confirm(`Deactivate "${material.name}"? It stays in stock history but can no longer be purchased or used.`)) return;
    setDeactivating(true);
    try {
      await adminFetch(`/admin/bom/raw-materials/${id}/deactivate`, { method: 'POST' });
      addToast('Raw material deactivated.', 'success');
      router.push('/admin/bom/raw-materials');
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not deactivate', 'error');
      setDeactivating(false);
    }
  }

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading raw material…</p>;
  }

  if (error && !material) {
    return (
      <p role="alert" className="card p-4 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (!material) return null;

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
                  : 'border-green-200 bg-green-50 text-green-800',
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
        title={material.name}
        description={`${material.sku} · ${material.isActive ? 'Active' : 'Inactive'}`}
        context={
          <Link href="/admin/bom/raw-materials" className="hover:text-neutral-900">
            ← Raw Materials
          </Link>
        }
        action={
          canManage && material.isActive ? (
            <button type="button" onClick={() => void deactivate()} disabled={deactivating} className="btn-ghost text-red-700">
              {deactivating ? 'Deactivating…' : 'Deactivate'}
            </button>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="mb-6">
        <MetricStrip
          label="Raw material summary"
          items={[
            {
              key: 'stock',
              label: 'Stock',
              value: formatQuantity(material.stockBase, material.unitScale, material.unit),
            },
            ...(material.costPrice !== undefined
              ? [
                  {
                    key: 'cost',
                    label: `Cost / ${UNIT_LABELS[material.unit]}`,
                    value: formatMoney(material.costPrice),
                  },
                ]
              : []),
            {
              key: 'scale',
              label: 'Unit scale',
              value: `${material.unitScale} / ${UNIT_LABELS[material.unit]}`,
            },
          ]}
        />
      </div>

      <form onSubmit={save} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="field-label">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="field-input"
            disabled={!canManage}
            required
          />
        </label>
        <label className="block">
          <span className="field-label">Kind</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as RawMaterialKind)}
            className="field-input"
            disabled={!canManage}
          >
            {RAW_MATERIAL_KINDS.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block lg:col-span-4">
          <span className="field-label">Notes</span>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="field-input"
            disabled={!canManage}
          />
        </label>
        {canManage ? (
          <div className="flex items-end lg:col-span-4">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : null}
      </form>

      <h2 className="mb-3 text-lg font-medium text-neutral-900">Recent stock movements</h2>
      <div className="overflow-hidden">
        <DataTable
          rows={material.recentMovements}
          rowKey={(movement) => movement.id}
          emptyLabel="No stock movements yet."
          columns={[
            { header: 'Date', muted: true, cell: (movement) => formatDateTime(movement.createdAt) },
            {
              header: 'Reason',
              muted: true,
              cell: (movement) => (
                <>
                  {movement.reason}
                  {movement.note ? <span className="ms-1 text-xs text-neutral-900/60">({movement.note})</span> : null}
                </>
              ),
            },
            {
              header: 'Change',
              numeric: true,
              align: 'end',
              cell: (movement) => (
                <span className={movement.delta >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {movement.delta >= 0 ? '+' : ''}
                  {formatQuantity(movement.delta, material.unitScale, material.unit)}
                </span>
              ),
            },
            {
              header: 'Resulting stock',
              numeric: true,
              align: 'end',
              cell: (movement) => formatQuantity(movement.resultingStock, material.unitScale, material.unit),
            },
          ]}
        />
      </div>
    </>
  );
}
