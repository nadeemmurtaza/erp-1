'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatMoney, formatQuantity, UNIT_LABELS, type RawMaterialUnit } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/utils/cn';
import { DataTable, PageHeader } from '@/components/ui';
import type { PaginatedResponse } from '@/types/api';
import { Select } from '@/components/ui/select';

const RAW_MATERIAL_KINDS = ['fabric', 'trim', 'packaging', 'consumable'] as const;
type RawMaterialKind = (typeof RAW_MATERIAL_KINDS)[number];

const UNITS = Object.keys(UNIT_LABELS) as RawMaterialUnit[];

interface RawMaterial {
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
  createdAt: string;
  updatedAt: string;
}

/**
 * Raw materials — fabric, trim, packaging, consumables bought in to make
 * finished products. Each one is an ordinary catalog variant underneath
 * (D5, bom.prisma); this screen is the staff-facing shape of that: base
 * units never appear here, only the display unit fabric is actually
 * measured in.
 */
export default function RawMaterialsPage() {
  const { toasts, add: addToast, remove: removeToast } = useToast();
  const { can } = useAdminSession();
  const canManage = can('bom.manage');

  const [materials, setMaterials] = useState<PaginatedResponse<RawMaterial> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [kind, setKind] = useState<RawMaterialKind | ''>('');
  const [filter, setFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [page, setPage] = useState(1);

  const [name, setName] = useState('');
  const [newKind, setNewKind] = useState<RawMaterialKind>('fabric');
  const [unit, setUnit] = useState<RawMaterialUnit>('GAZ');
  const [unitScale, setUnitScale] = useState('1000');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setMaterials(
        await adminFetch<PaginatedResponse<RawMaterial>>('/admin/bom/raw-materials', {
          query: { q: q || undefined, kind: kind || undefined, filter, page, pageSize: 20 },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load raw materials');
    } finally {
      setBusy(false);
    }
  }, [q, kind, filter, page]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function createMaterial(event: React.FormEvent) {
    event.preventDefault();
    const scale = Number(unitScale) || 1;
    setCreating(true);
    try {
      await adminFetch('/admin/bom/raw-materials', {
        method: 'POST',
        body: {
          name: name.trim(),
          kind: newKind,
          unit,
          unitScale: scale,
          notes: notes.trim() || undefined,
        },
      });
      setName('');
      setNotes('');
      addToast('Raw material created.', 'success');
      setPage(1);
      await load();
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not create the raw material', 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-toast flex flex-col gap-2">
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
        title="Raw Materials"
        description="Fabric, trim, packaging and consumables bought in to make finished products."
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <form
          onSubmit={createMaterial}
          className="card mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6"
        >
          <label className="block lg:col-span-2">
            <span className="field-label">Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="field-input"
              required
            />
          </label>
          <label className="block">
            <span className="field-label">Kind</span>
            <select
              value={newKind}
              onChange={(event) => setNewKind(event.target.value as RawMaterialKind)}
              className="field-input"
            >
              {RAW_MATERIAL_KINDS.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Unit</span>
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value as RawMaterialUnit)}
              className="field-input"
            >
              {UNITS.map((value) => (
                <option key={value} value={value}>
                  {UNIT_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Base units per {UNIT_LABELS[unit]}</span>
            <input
              type="number"
              min="1"
              step="1"
              value={unitScale}
              onChange={(event) => setUnitScale(event.target.value)}
              className="field-input"
              required
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="field-label">Notes (optional)</span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="field-input"
            />
          </label>
          <div className="flex items-end lg:col-span-6">
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Creating…' : 'Add raw material'}
            </button>
          </div>
        </form>
      ) : null}

      <div role="group" aria-label="Filter raw materials" className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(event) => {
            setPage(1);
            setQ(event.target.value);
          }}
          placeholder="Search name…"
          className="field-input w-auto flex-1"
          aria-label="Search"
        />
        <select
          value={kind}
          onChange={(event) => {
            setPage(1);
            setKind(event.target.value as RawMaterialKind | '');
          }}
          className="field-input w-auto"
          aria-label="Kind"
        >
          <option value="">All kinds</option>
          {RAW_MATERIAL_KINDS.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
        <Select
          label="Status"
          value={filter}
          onChange={(next) => {
            setPage(1);
            setFilter(next as 'active' | 'inactive' | 'all');
          }}
          className="w-auto"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      <div className="overflow-hidden">
        <DataTable
          rows={materials?.data}
          loading={busy && !materials}
          rowKey={(row) => row.id}
          emptyLabel="No raw materials match those filters."
          columns={[
            {
              header: 'Name',
              cell: (row) => (
                <Link
                  href={`/admin/bom/raw-materials/${row.id}`}
                  className="font-medium text-neutral-900 hover:text-accent-hover"
                >
                  {row.name}
                </Link>
              ),
            },
            { header: 'SKU', muted: true, cell: (row) => row.sku },
            { header: 'Kind', muted: true, cell: (row) => row.kind },
            {
              header: 'Stock',
              numeric: true,
              align: 'end',
              cell: (row) => formatQuantity(row.stockBase, row.unitScale, row.unit),
            },
            ...(materials?.data.some((row) => row.costPrice !== undefined)
              ? [
                  {
                    header: 'Cost',
                    numeric: true,
                    align: 'end' as const,
                    cell: (row: RawMaterial) =>
                      row.costPrice !== undefined ? formatMoney(row.costPrice) : '—',
                  },
                ]
              : []),
            {
              header: 'Status',
              muted: true,
              cell: (row) => (row.isActive ? 'Active' : 'Inactive'),
            },
          ]}
        />

        {materials && materials.meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm">
            <button
              type="button"
              className="btn-ghost"
              disabled={!materials.meta.hasPrevious}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>
            <span className="text-neutral-900/60">
              Page {materials.meta.page} of {materials.meta.totalPages} · {materials.meta.total} materials
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={!materials.meta.hasNext}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
