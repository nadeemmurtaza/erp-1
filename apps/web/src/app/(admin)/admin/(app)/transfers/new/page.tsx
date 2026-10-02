'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/admin-client';
import { ROUTES } from '@/constants/routes';
import type { InventoryVariantRow, Location } from '@/types/api';
import { DataTable, PageHeader, Section } from '@/components/ui';
import { Select } from '@/components/ui/select';

interface Line {
  variantId: string;
  sku: string;
  label: string;
  quantity: number;
}

/**
 * Dispatch a transfer (RETAIL-ERP.md R4, WO-22.1; org-central purchasing,
 * WO-23.3d) — one local `moveMany()` at the source, landing in that
 * transfer's own in-transit `Location`. An org warehouse (no brand
 * recorded, type WAREHOUSE) shipping to a branded store settles NONE, same
 * as any other owned→owned move — no extra step here names that; the API
 * decides it from the two locations picked.
 */
export default function NewTransferPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<InventoryVariantRow[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Location[]>('/admin/inventory/locations')
      .then(setLocations)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      adminFetch<InventoryVariantRow[]>('/admin/inventory', { query: { search } })
        .then((rows) => setResults(rows.slice(0, 10)))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  function addLine(variant: InventoryVariantRow) {
    if (lines.some((line) => line.variantId === variant.id)) return;
    setLines([
      ...lines,
      {
        variantId: variant.id,
        sku: variant.sku,
        label: `${variant.productName} ${variant.size ?? ''} ${variant.color ?? ''}`.trim(),
        quantity: 1,
      },
    ]);
    setSearch('');
    setResults([]);
  }

  function updateQuantity(variantId: string, quantity: number) {
    setLines(lines.map((line) => (line.variantId === variantId ? { ...line, quantity } : line)));
  }

  function removeLine(variantId: string) {
    setLines(lines.filter((line) => line.variantId !== variantId));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const transfer = await adminFetch<{ id: string }>('/admin/transfers', {
        method: 'POST',
        body: {
          sourceLocationId,
          destinationLocationId,
          lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
          note: note.trim() || undefined,
        },
      });
      router.push(ROUTES.admin.transfer(transfer.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not dispatch this transfer');
      setSaving(false);
    }
  }

  const canSubmit =
    sourceLocationId && destinationLocationId && sourceLocationId !== destinationLocationId && lines.length > 0;

  return (
    <>
      <PageHeader title="New transfer" description="Dispatch stock from one location — it lands in an in-transit bucket until received." />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <Section title="Locations">
        <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="transfer-source" className="field-label">
              From
            </label>
            <Select
              id="transfer-source"
              label="From"
              placeholder="Choose a source…"
              value={sourceLocationId}
              onChange={setSourceLocationId}
              options={[
                { value: '', label: 'Choose a source…' },
                ...locations.map((location) => ({
                  value: location.id,
                  label: `${location.name} (${location.type === 'WAREHOUSE' && !location.retailBrandId ? 'org warehouse' : location.type.toLowerCase()})`,
                })),
              ]}
            />
          </div>
          <div>
            <label htmlFor="transfer-destination" className="field-label">
              To
            </label>
            <Select
              id="transfer-destination"
              label="To"
              placeholder="Choose a destination…"
              value={destinationLocationId}
              onChange={setDestinationLocationId}
              options={[
                { value: '', label: 'Choose a destination…' },
                ...locations
                  .filter((location) => location.id !== sourceLocationId)
                  .map((location) => ({ value: location.id, label: location.name })),
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Lines" description="Search by SKU or product name to add a line.">
        <div className="relative mb-3 max-w-md">
          <input
            type="text"
            className="field-input w-full"
            placeholder="Search variants…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {results.length > 0 ? (
            <ul className="absolute z-dropdown mt-1 w-full rounded bg-overlay shadow-md">
              {results.map((variant) => (
                <li key={variant.id}>
                  <button
                    type="button"
                    onClick={() => addLine(variant)}
                    className="block w-full px-3 py-2 text-start text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-900">{variant.productName}</span>{' '}
                    <span className="text-neutral-900/60">{variant.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-neutral-900/60">No lines yet.</p>
        ) : (
          <DataTable
            rows={lines}
            rowKey={(line) => line.variantId}
            columns={[
              {
                header: 'Item',
                cell: (line) => (
                  <>
                    <div className="font-medium text-neutral-900">{line.label}</div>
                    <div className="text-xs text-neutral-900/60">{line.sku}</div>
                  </>
                ),
              },
              {
                header: 'Quantity',
                align: 'end',
                cell: (line) => (
                  <input
                    type="number"
                    min={1}
                    className="field-input w-20 text-end"
                    value={line.quantity}
                    onChange={(event) => updateQuantity(line.variantId, parseInt(event.target.value, 10) || 1)}
                  />
                ),
              },
              {
                header: '',
                align: 'end',
                cell: (line) => (
                  <button type="button" onClick={() => removeLine(line.variantId)} className="btn-text text-feedback-negative">
                    Remove
                  </button>
                ),
              },
            ]}
          />
        )}
      </Section>

      <Section title="Note">
        <textarea
          className="field-input w-full max-w-2xl"
          rows={2}
          placeholder="Optional"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Section>

      <button type="button" disabled={!canSubmit || saving} onClick={() => void submit()} className="btn-primary">
        {saving ? 'Dispatching…' : 'Dispatch transfer'}
      </button>
    </>
  );
}
