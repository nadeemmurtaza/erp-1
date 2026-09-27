'use client';

import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Dialog, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/common/status-badge';
import type { AdminBundle, AdminProduct, PaginatedResponse } from '@/types/api';

interface PickedComponent {
  variantId: string;
  label: string;
  quantity: string;
}

/**
 * 150-product-kitting-bundles.md WO-150.6 — the bundle-builder admin
 * screen. The backend (`BundlesService`/`catalog-admin.controller.ts`) has
 * carried full CRUD since this document's own earlier build pass; this
 * screen is what makes it reachable by a human rather than only a raw API
 * call — see this document's own "not built in this pass" note.
 *
 * A bundle's own variant is created like any ordinary product first (its
 * own name, SKU and price, on the regular product editor) — this screen
 * only attaches components to an already-existing variant, matching
 * `CreateBundleDto`'s own shape (`variantId` immutable once set, per
 * `BundlesService.update()`'s own refusal to change it).
 */
export default function BundlesPage() {
  const [bundles, setBundles] = useState<AdminBundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [ownVariant, setOwnVariant] = useState<{ id: string; label: string } | null>(null);
  const [components, setComponents] = useState<PickedComponent[]>([]);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<AdminBundle | null>(null);
  const [editComponents, setEditComponents] = useState<PickedComponent[]>([]);
  const [editActive, setEditActive] = useState(true);

  const [deleting, setDeleting] = useState<AdminBundle | null>(null);

  const load = () => {
    adminFetch<AdminBundle[]>('/admin/catalog/bundles')
      .then(setBundles)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load bundles'));
  };

  useEffect(load, []);

  function resetCreateForm() {
    setCreating(false);
    setOwnVariant(null);
    setComponents([]);
  }

  async function createBundle() {
    if (!ownVariant || components.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/admin/catalog/bundles', {
        method: 'POST',
        body: {
          variantId: ownVariant.id,
          components: components.map((c) => ({ componentVariantId: c.variantId, quantity: Number(c.quantity) || 1 })),
        },
      });
      resetCreateForm();
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this bundle');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(bundle: AdminBundle) {
    setEditing(bundle);
    setEditActive(bundle.isActive);
    setEditComponents(
      bundle.components.map((c) => ({ variantId: c.componentVariantId, label: c.label, quantity: String(c.quantity) })),
    );
  }

  async function saveEdit() {
    if (!editing || editComponents.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/catalog/bundles/${editing.id}`, {
        method: 'PATCH',
        body: {
          isActive: editActive,
          components: editComponents.map((c) => ({ componentVariantId: c.variantId, quantity: Number(c.quantity) || 1 })),
        },
      });
      setEditing(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this bundle');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch(`/admin/catalog/bundles/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this bundle');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Bundles"
        description="Sell several existing products together as one purchasable kit — each sale decrements every component's own stock."
        action={
          !creating ? (
            <button type="button" onClick={() => setCreating(true)} className="btn-primary">
              New bundle
            </button>
          ) : undefined
        }
      />

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      {creating ? (
        <div className="card mb-6 space-y-4 p-6">
          <h2 className="font-medium text-neutral-900">New bundle</h2>

          <div>
            <span className="field-label mb-1 block">The bundle&apos;s own product</span>
            {ownVariant ? (
              <div className="flex items-center justify-between field-input">
                <span>{ownVariant.label}</span>
                <button type="button" onClick={() => setOwnVariant(null)} className="text-xs text-accent-hover hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <VariantSearchPicker
                placeholder="Search the product that will BE the bundle…"
                onPick={(variant) => setOwnVariant(variant)}
              />
            )}
            <p className="mt-1 text-xs text-neutral-900/60">
              Create it first on the regular product screen — its own name, SKU and price — then pick it here.
            </p>
          </div>

          <ComponentListEditor components={components} onChange={setComponents} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void createBundle()}
              disabled={!ownVariant || components.length === 0 || saving}
              className="btn-primary"
            >
              {saving ? 'Creating…' : 'Create bundle'}
            </button>
            <button type="button" onClick={resetCreateForm} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {bundles && bundles.length === 0 && !creating ? (
        <EmptyState
          title="No bundles yet"
          description="Sell a starter kit, a gift set or a combo as one purchasable item."
          action={
            <button type="button" onClick={() => setCreating(true)} className="btn-primary">
              New bundle
            </button>
          }
        />
      ) : (
        <DataTable
          rows={bundles}
          loading={!bundles}
          emptyLabel="No bundles found."
          rowKey={(b) => b.id}
          columns={[
            { header: 'Bundle', cell: (b) => b.variantLabel },
            {
              header: 'Components',
              muted: true,
              cell: (b) => b.components.map((c) => `${c.quantity}× ${c.label}`).join(', '),
            },
            {
              header: 'Status',
              cell: (b) => (b.isActive ? <StatusBadge status="ACTIVE" label="Active" /> : <StatusBadge status="ARCHIVED" label="Inactive" />),
            },
            {
              header: '',
              align: 'end',
              cell: (b) => (
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => openEdit(b)} className="btn-secondary">
                    Edit
                  </button>
                  <button type="button" onClick={() => setDeleting(b)} className="btn-danger">
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.variantLabel}` : 'Edit bundle'}
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={() => void saveEdit()} disabled={editComponents.length === 0 || saving} className="btn-primary">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" className="field-check" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
          Active — this bundle can be sold
        </label>
        <ComponentListEditor components={editComponents} onChange={setEditComponents} />
      </Dialog>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this bundle?"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={() => void confirmDelete()} disabled={saving} className="btn-danger">
              {saving ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p className="text-sm text-neutral-900">
          {deleting?.variantLabel} will no longer be sellable as a bundle. The product itself, and every component&apos;s
          own stock, is untouched.
        </p>
      </Dialog>
    </>
  );
}

/** Adds/removes/edits quantity on a bundle's own component list — shared
 *  between the create form and the edit dialog. */
function ComponentListEditor({
  components,
  onChange,
}: {
  components: PickedComponent[];
  onChange: (next: PickedComponent[]) => void;
}) {
  return (
    <div>
      <span className="field-label mb-1 block">Components</span>
      {components.length > 0 ? (
        <ul className="mb-2 divide-y divide-neutral-100 rounded border border-neutral-100">
          {components.map((component, index) => (
            <li key={component.variantId} className="flex items-center gap-2 p-2">
              <span className="flex-1 text-sm text-neutral-900">{component.label}</span>
              <input
                type="number"
                min={1}
                value={component.quantity}
                onChange={(e) => {
                  const next = [...components];
                  next[index] = { ...component, quantity: e.target.value };
                  onChange(next);
                }}
                className="field-input w-16 py-1 text-sm"
                aria-label={`Quantity of ${component.label}`}
              />
              <button
                type="button"
                onClick={() => onChange(components.filter((_, i) => i !== index))}
                className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-neutral-900/60">No components added yet.</p>
      )}
      <VariantSearchPicker
        placeholder="Search a product to add as a component…"
        onPick={(variant) => {
          if (components.some((c) => c.variantId === variant.id)) return;
          onChange([...components, { variantId: variant.id, label: variant.label, quantity: '1' }]);
        }}
      />
    </div>
  );
}

/** Debounced product/variant search, mirroring `cross-sell-manager.tsx`'s
 *  own established pattern — flattened to variant granularity, since a
 *  bundle's own identity and every component are specific variants, not
 *  whole products. */
function VariantSearchPicker({
  placeholder,
  onPick,
}: {
  placeholder: string;
  onPick: (variant: { id: string; label: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceHandle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(debounceHandle.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceHandle.current = setTimeout(() => {
      setSearching(true);
      adminFetch<PaginatedResponse<AdminProduct>>('/admin/catalog/products', { query: { q: query.trim(), pageSize: 6 } })
        .then((page) => setResults(page.data))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(debounceHandle.current);
  }, [query]);

  const options = results.flatMap((product) => {
    const name = product.translations.find((t) => t.locale === 'en')?.name ?? product.slug;
    return product.variants.map((variant) => {
      const variantLabel = [variant.size, variant.color].filter(Boolean).join(' / ');
      return {
        id: variant.id,
        label: variantLabel ? `${name} — ${variantLabel} (${variant.sku})` : `${name} (${variant.sku})`,
      };
    });
  });

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="field-input w-full"
      />
      {query.trim().length >= 2 ? (
        <ul className="mt-2 divide-y divide-neutral-100 rounded border border-neutral-100">
          {searching ? (
            <li className="px-3 py-2 text-xs text-neutral-900/60">Searching…</li>
          ) : options.length > 0 ? (
            options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(option);
                    setQuery('');
                    setResults([]);
                  }}
                  className="w-full p-2 text-start text-sm hover:bg-neutral-50"
                >
                  {option.label}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-xs text-neutral-900/60">No matching products.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
