'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import { PageHeader, DataTable } from '@/components/ui';
import type { Location } from '@/types/api';

interface VariantSearchResult {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  stock: number;
  product: { id: string; name: string };
}

interface RequisitionLineDraft {
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  estimatedUnitCostMinor: number | null;
}

export default function NewRequisitionPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [justification, setJustification] = useState('');
  const [lines, setLines] = useState<RequisitionLineDraft[]>([]);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Location[]>('/admin/inventory/locations')
      .then((result) => {
        setLocations(result);
        setLocationId(result.find((l) => l.isDefault)?.id ?? result[0]?.id ?? '');
      })
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      adminFetch<{ data: VariantSearchResult[] }>('/admin/inventory', { query: { search } })
        .then((res) => setResults(res.data.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [search]);

  const addLine = (v: VariantSearchResult) => {
    if (lines.some((l) => l.variantId === v.id)) return;
    const name = `${v.product.name} ${v.size ?? ''} ${v.color ?? ''}`.trim();
    setLines([...lines, { variantId: v.id, sku: v.sku, name, quantity: 1, estimatedUnitCostMinor: null }]);
    setSearch('');
    setResults([]);
  };

  const removeLine = (index: number) => setLines(lines.filter((_, i) => i !== index));

  const updateLine = (index: number, field: 'quantity' | 'estimatedUnitCostMinor', value: number) => {
    const next = [...lines];
    next[index] = { ...next[index], [field]: value };
    setLines(next);
  };

  const submit = async () => {
    if (!locationId || !justification.trim() || lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const result = await adminFetch<{ id: string }>('/admin/requisitions', {
        method: 'POST',
        body: {
          locationId,
          justification: justification.trim(),
          lines: lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            estimatedUnitCostMinor: l.estimatedUnitCostMinor ?? undefined,
          })),
        },
      });
      router.push(ROUTES.admin.requisition(result.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create requisition');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="New requisition" description="Request a purchase — a purchasing role reviews it before any PO is raised." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="card p-6 mb-6 space-y-4 max-w-md">
        <div>
          <label htmlFor="req-location" className="mb-1 block text-sm font-medium text-neutral-900">
            Location
          </label>
          <select id="req-location" className="field-input w-full" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="req-justification" className="mb-1 block text-sm font-medium text-neutral-900">
            Justification
          </label>
          <textarea
            id="req-justification"
            className="field-input w-full"
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Why this purchase is needed"
          />
        </div>
      </div>

      <div className="card p-6 mb-6">
        <label htmlFor="req-search" className="mb-1 block text-sm font-medium text-neutral-900">
          Add items
        </label>
        <input
          id="req-search"
          className="field-input w-full max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by SKU or product name..."
        />
        {searching ? <p className="mt-2 text-xs text-neutral-900/60">Searching…</p> : null}
        {results.length > 0 ? (
          <ul className="mt-2 max-w-md divide-y divide-neutral-100 rounded border border-neutral-100">
            {results.map((v) => (
              <li key={v.id} className="flex items-center justify-between p-2">
                <div>
                  <div className="text-sm font-medium">{v.product.name}</div>
                  <div className="text-xs text-neutral-900/60">{v.sku}</div>
                </div>
                <button onClick={() => addLine(v)} className="text-xs font-medium text-accent-hover hover:underline">
                  Add
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <p className="text-sm text-neutral-900/60">No lines added yet.</p>
      ) : (
        <div className="overflow-hidden mb-6">
          <DataTable
            rows={lines}
            rowKey={(l) => l.variantId}
            columns={[
              {
                header: 'Item',
                cell: (l) => (
                  <>
                    <div className="font-medium text-neutral-900">{l.name}</div>
                    <div className="text-xs text-neutral-900/60">{l.sku}</div>
                  </>
                ),
              },
              {
                header: 'Qty',
                align: 'end',
                cell: (l, i) => (
                  <input
                    type="number"
                    min="1"
                    className="field-input w-20 text-end"
                    value={l.quantity}
                    onChange={(e) => updateLine(i, 'quantity', parseInt(e.target.value) || 1)}
                  />
                ),
              },
              {
                header: 'Est. cost (paisa)',
                align: 'end',
                cell: (l, i) => (
                  <input
                    type="number"
                    min="0"
                    className="field-input w-28 text-end"
                    value={l.estimatedUnitCostMinor ?? ''}
                    onChange={(e) => updateLine(i, 'estimatedUnitCostMinor', parseInt(e.target.value) || 0)}
                  />
                ),
              },
              {
                header: '',
                align: 'end',
                cell: (_l, i) => (
                  <button onClick={() => removeLine(i)} className="text-red-600 hover:underline text-xs">
                    Remove
                  </button>
                ),
              },
            ]}
          />
        </div>
      )}

      <button
        onClick={submit}
        disabled={saving || !locationId || !justification.trim() || lines.length === 0}
        className="btn-primary"
      >
        Submit requisition
      </button>
    </>
  );
}
