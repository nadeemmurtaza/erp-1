'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fromBaseUnits, toBaseUnits, toMajor, toMinor, UNIT_LABELS, type RawMaterialUnit } from '@newax/shared';
import { adminFetch } from '@/lib/admin-client';
import { useToast } from '@/hooks/use-toast';
import { ToastStack } from '@/components/admin/toast-stack';
import { Select } from '@/components/ui/select';

interface RawMaterialOption {
  id: string;
  name: string;
  sku: string;
  unit: RawMaterialUnit;
  unitScale: number;
}

interface ComponentRow {
  rawMaterialId: string;
  /** DISPLAY quantity — the unit boundary this form never crosses without toBaseUnits/fromBaseUnits. */
  quantityDisplay: string;
  wastagePercent: string;
  isOptional: boolean;
  note: string;
}

interface RecipeDetail {
  id: string;
  variantId: string;
  sku: string;
  outputQuantity: number;
  wastageBps: number;
  labourCost: number;
  overheadCost: number;
  notes: string | null;
  components: Array<{
    rawMaterialId: string;
    quantityBase: number;
    unit: RawMaterialUnit;
    unitScale: number;
    wastageBps: number | null;
    isOptional: boolean;
    note: string | null;
  }>;
}

const emptyRow: ComponentRow = { rawMaterialId: '', quantityDisplay: '', wastagePercent: '', isOptional: false, note: '' };

/**
 * Create or edit a recipe. Quantities are entered and shown in the raw
 * material's own display unit (gaz, piece, spool…) and converted to base
 * units only at submit, through toBaseUnits — never a bare scale
 * multiplication in this file (10-admin-dashboard.md WO-C.1's own rule,
 * binding here too).
 */
export function RecipeEditor({ recipeId, initialVariantId }: { recipeId?: string; initialVariantId?: string }) {
  const router = useRouter();
  const { toasts, add: addToast, remove: removeToast } = useToast();

  const [materials, setMaterials] = useState<RawMaterialOption[]>([]);
  const [busy, setBusy] = useState(Boolean(recipeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [variantId, setVariantId] = useState(initialVariantId ?? '');
  const [sku, setSku] = useState('');
  const [outputQuantity, setOutputQuantity] = useState('1');
  const [wastagePercent, setWastagePercent] = useState('0');
  const [labourCostRupees, setLabourCostRupees] = useState('0');
  const [overheadCostRupees, setOverheadCostRupees] = useState('0');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ComponentRow[]>([{ ...emptyRow }]);

  const materialById = useCallback(
    (id: string) => materials.find((material) => material.id === id),
    [materials],
  );

  useEffect(() => {
    adminFetch<{ data: RawMaterialOption[] }>('/admin/bom/raw-materials', { query: { filter: 'active', pageSize: 200 } })
      .then((result) => setMaterials(result.data))
      .catch(() => addToast('Could not load raw materials.', 'error'));
    // addToast is stable from useToast's own useCallback; omitted to avoid a refetch loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recipeId) return;
    adminFetch<RecipeDetail>(`/admin/bom/recipes/${recipeId}`)
      .then((recipe) => {
        setVariantId(recipe.variantId);
        setSku(recipe.sku);
        setOutputQuantity(String(recipe.outputQuantity));
        setWastagePercent(String(recipe.wastageBps / 100));
        setLabourCostRupees(toMajor(recipe.labourCost).toString());
        setOverheadCostRupees(toMajor(recipe.overheadCost).toString());
        setNotes(recipe.notes ?? '');
        setRows(
          recipe.components.length > 0
            ? recipe.components.map((component) => ({
                rawMaterialId: component.rawMaterialId,
                quantityDisplay: String(fromBaseUnits(component.quantityBase, component.unitScale)),
                wastagePercent: component.wastageBps !== null ? String(component.wastageBps / 100) : '',
                isOptional: component.isOptional,
                note: component.note ?? '',
              }))
            : [{ ...emptyRow }],
        );
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the recipe'))
      .finally(() => setBusy(false));
  }, [recipeId]);

  function updateRow(index: number, patch: Partial<ComponentRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { ...emptyRow }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const usableRows = rows.filter((row) => row.rawMaterialId);
    if (usableRows.length === 0) {
      addToast('Add at least one component.', 'error');
      return;
    }

    const components = usableRows.map((row) => {
      const material = materialById(row.rawMaterialId);
      const displayQty = Number(row.quantityDisplay) || 0;
      return {
        rawMaterialId: row.rawMaterialId,
        quantityBase: material ? toBaseUnits(displayQty, material.unitScale) : Math.round(displayQty),
        wastageBps: row.wastagePercent.trim() ? Math.round(Number(row.wastagePercent) * 100) : undefined,
        isOptional: row.isOptional,
        note: row.note.trim() || undefined,
      };
    });

    const body = {
      variantId: variantId || undefined,
      outputQuantity: Math.max(1, Math.round(Number(outputQuantity) || 1)),
      wastageBps: Math.round((Number(wastagePercent) || 0) * 100),
      labourCost: toMinor(Number(labourCostRupees) || 0),
      overheadCost: toMinor(Number(overheadCostRupees) || 0),
      notes: notes.trim() || undefined,
      components,
    };

    setSaving(true);
    try {
      if (recipeId) {
        await adminFetch(`/admin/bom/recipes/${recipeId}`, { method: 'PATCH', body });
        addToast('Recipe saved.', 'success');
        router.push(`/admin/bom/${recipeId}`);
      } else {
        const created = await adminFetch<{ id: string }>('/admin/bom/recipes', { method: 'POST', body });
        addToast('Recipe created.', 'success');
        router.push(`/admin/bom/${created.id}`);
      }
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'Could not save the recipe', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (busy) {
    return <p className="p-4 text-sm text-neutral-900/60">Loading recipe…</p>;
  }

  return (
    <>
      <ToastStack toasts={toasts} onDismiss={removeToast} />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-6">
        <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block lg:col-span-2">
            <span className="field-label">Finished product variant id</span>
            <input
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
              className="field-input"
              placeholder="ProductVariant id"
              disabled={Boolean(recipeId)}
              required
            />
            {sku ? <p className="mt-1 text-xs text-neutral-900/60">{sku}</p> : null}
          </label>
          <label className="block">
            <span className="field-label">Output quantity</span>
            <input
              type="number"
              min="1"
              step="1"
              value={outputQuantity}
              onChange={(event) => setOutputQuantity(event.target.value)}
              className="field-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Default wastage %</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={wastagePercent}
              onChange={(event) => setWastagePercent(event.target.value)}
              className="field-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Labour cost (Rs, per finished unit)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={labourCostRupees}
              onChange={(event) => setLabourCostRupees(event.target.value)}
              className="field-input"
            />
          </label>
          <label className="block">
            <span className="field-label">Overhead cost (Rs, per finished unit)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={overheadCostRupees}
              onChange={(event) => setOverheadCostRupees(event.target.value)}
              className="field-input"
            />
          </label>
          <label className="block lg:col-span-2">
            <span className="field-label">Notes</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} className="field-input" />
          </label>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Components</h2>
            <button type="button" onClick={addRow} className="btn-secondary">
              Add component
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => {
              const material = materialById(row.rawMaterialId);
              return (
                <div key={index} className="grid gap-2 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="lg:col-span-2">
                    <label htmlFor={`recipe-material-${index}`} className="field-label">
                      Raw material
                    </label>
                    <Select
                      id={`recipe-material-${index}`}
                      label="Raw material"
                      required
                      placeholder="Choose…"
                      value={row.rawMaterialId}
                      onChange={(next) => updateRow(index, { rawMaterialId: next })}
                      options={materials.map((option) => ({ value: option.id, label: `${option.name} (${option.sku})` }))}
                    />
                  </div>
                  <label className="block">
                    <span className="field-label">Quantity {material ? `(${UNIT_LABELS[material.unit]})` : ''}</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={row.quantityDisplay}
                      onChange={(event) => updateRow(index, { quantityDisplay: event.target.value })}
                      className="field-input"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Wastage % (optional)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={row.wastagePercent}
                      onChange={(event) => updateRow(index, { wastagePercent: event.target.value })}
                      className="field-input"
                      placeholder="inherit"
                    />
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-sm text-neutral-900/70">
                    <input
                      type="checkbox"
                      checked={row.isOptional}
                      onChange={(event) => updateRow(index, { isOptional: event.target.checked })}
                      className="field-check"
                    />
                    Optional
                  </label>
                  <div className="flex items-end justify-between gap-2">
                    <input
                      value={row.note}
                      onChange={(event) => updateRow(index, { note: event.target.value })}
                      placeholder="Note"
                      className="field-input"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-xs text-neutral-900/60 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : recipeId ? 'Save recipe' : 'Create recipe'}
          </button>
        </div>
      </form>
    </>
  );
}
