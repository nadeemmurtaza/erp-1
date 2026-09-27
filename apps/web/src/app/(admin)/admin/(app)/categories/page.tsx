'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable, Dialog, EmptyState } from '@/components/ui';
import { cn } from '@/utils/cn';
import type { AdminCategory, CategoryPreset, CategoryPresetPreview } from '@/types/api';

interface Draft {
  id?: string;
  slug: string;
  nameEn: string;
  nameUr: string;
  parentId: string;
  order: string;
  isActive: boolean;
}

const BLANK: Draft = {
  slug: '',
  nameEn: '',
  nameUr: '',
  parentId: '',
  order: '0',
  isActive: true,
};

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 47-preconfigured-sector-taxonomy.md WO-47.4 — "start from a template".
  const [presetPicker, setPresetPicker] = useState(false);
  const [presets, setPresets] = useState<CategoryPreset[] | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<CategoryPreset | null>(null);
  const [presetPreview, setPresetPreview] = useState<CategoryPresetPreview | null>(null);
  const [presetBusy, setPresetBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await adminFetch<AdminCategory[]>('/admin/catalog/categories'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load categories');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openPresetPicker() {
    setPresetError(null);
    setSelectedPreset(null);
    setPresetPreview(null);
    setPresetPicker(true);
    if (!presets) {
      adminFetch<CategoryPreset[]>('/admin/catalog/category-presets')
        .then(setPresets)
        .catch((cause) => setPresetError(cause instanceof Error ? cause.message : 'Could not load the starter templates'));
    }
  }

  async function choosePreset(preset: CategoryPreset) {
    setSelectedPreset(preset);
    setPresetPreview(null);
    setPresetError(null);
    try {
      setPresetPreview(await adminFetch<CategoryPresetPreview>(`/admin/catalog/category-presets/${preset.key}/preview`));
    } catch (cause) {
      setPresetError(cause instanceof Error ? cause.message : 'Could not preview this template');
    }
  }

  async function applyPreset() {
    if (!selectedPreset) return;
    setPresetBusy(true);
    setPresetError(null);
    try {
      await adminFetch(`/admin/catalog/category-presets/${selectedPreset.key}/apply`, { method: 'POST' });
      setPresetPicker(false);
      await load();
    } catch (cause) {
      setPresetError(cause instanceof Error ? cause.message : 'Could not apply this template');
    } finally {
      setPresetBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const payload = {
      slug: draft.slug || undefined,
      parentId: draft.parentId || undefined,
      order: Number(draft.order) || 0,
      isActive: draft.isActive,
      translations: [
        { locale: 'en' as const, name: draft.nameEn.trim() },
        ...(draft.nameUr.trim()
          ? [{ locale: 'ur' as const, name: draft.nameUr.trim() }]
          : []),
      ],
    };

    try {
      if (draft.id) {
        await adminFetch(`/admin/catalog/categories/${draft.id}`, {
          method: 'PATCH',
          body: payload,
        });
      } else {
        await adminFetch('/admin/catalog/categories', { method: 'POST', body: payload });
      }
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the category');
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: AdminCategory) {
    setError(null);
    try {
      await adminFetch(`/admin/catalog/categories/${category.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      // The API refuses to delete a category that still holds products, and
      // says which — surface that rather than a generic failure.
      setError(cause instanceof Error ? cause.message : 'Could not delete the category');
    }
  }

  function edit(category: AdminCategory) {
    setDraft({
      id: category.id,
      slug: category.slug,
      nameEn: category.translations.find((t) => t.locale === 'en')?.name ?? '',
      nameUr: category.translations.find((t) => t.locale === 'ur')?.name ?? '',
      parentId: category.parentId ?? '',
      order: String(category.order),
      isActive: category.isActive,
    });
  }

  return (
    <>
      <div className="mb-1 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-neutral-900">Categories</h1>
        <button type="button" onClick={openPresetPicker} className="btn-secondary shrink-0">
          Start from a template
        </button>
      </div>
      <p className="mb-6 text-sm text-neutral-900/60">
        How the storefront navigation is organised. Both languages are shown to customers.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="overflow-hidden">
          {categories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              description="Start from a ready-made taxonomy for your sector, or add categories one at a time on the right."
              action={
                <button type="button" onClick={openPresetPicker} className="btn-primary">
                  Start from a template
                </button>
              }
            />
          ) : (
          <div className="overflow-x-auto">
            <DataTable
              rows={asTree(categories)}
              rowKey={({ category }) => category.id}
              emptyLabel="No categories yet."
              columns={[
                {
                  header: 'Name',
                  cell: ({ category, depth }) => (
                    // Indent by depth, with a leader on nested rows so the
                    // hierarchy reads at a glance instead of having to be
                    // inferred from the parent picker.
                    <div style={{ paddingInlineStart: `${depth * 1.25}rem` }}>
                      <span className="font-medium text-neutral-900">
                        {depth > 0 ? (
                          <span aria-hidden className="me-1 text-neutral-900/60">
                            └
                          </span>
                        ) : null}
                        {category.translations.find((t) => t.locale === 'en')?.name ??
                          category.slug}
                      </span>
                      <p className="text-xs text-neutral-900/60">
                        {category.slug}
                        {category.isActive ? '' : ' · hidden'}
                      </p>
                    </div>
                  ),
                },
                {
                  header: 'Urdu',
                  muted: true,
                  className: 'font-urdu',
                  cell: ({ category }) => (
                    <span dir="rtl">
                      {category.translations.find((t) => t.locale === 'ur')?.name ?? '—'}
                    </span>
                  ),
                },
                {
                  header: 'Products',
                  align: 'end',
                  numeric: true,
                  muted: true,
                  cell: ({ category }) => category._count.products,
                },
                {
                  header: '',
                  align: 'end',
                  cell: ({ category }) => (
                    <>
                      <button
                        type="button"
                        onClick={() => edit(category)}
                        className="rounded px-2 py-1 text-xs text-accent-hover hover:bg-neutral-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(category)}
                        className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </>
                  ),
                },
              ]}
            />
          </div>
          )}
        </div>

        <form onSubmit={save} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            {draft.id ? 'Edit category' : 'Add a category'}
          </h2>

          <label className="block">
            <span className="field-label">Name (English)</span>
            <input
              value={draft.nameEn}
              onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
              required
              className="field-input"
            />
          </label>

          <label className="block" dir="rtl">
            <span className="field-label">نام (اردو)</span>
            <input
              value={draft.nameUr}
              onChange={(event) => setDraft({ ...draft, nameUr: event.target.value })}
              className="field-input font-urdu"
            />
          </label>

          <label className="block">
            <span className="field-label">Parent category</span>
            <select
              value={draft.parentId}
              onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}
              className="field-input"
            >
              <option value="">Top level</option>
              {categories
                .filter((category) => category.id !== draft.id)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.translations.find((t) => t.locale === 'en')?.name ??
                      category.slug}
                  </option>
                ))}
            </select>
          </label>

          <label className="block">
            <span className="field-label">Sort order</span>
            <input
              type="number"
              value={draft.order}
              onChange={(event) => setDraft({ ...draft, order: event.target.value })}
              className="field-input"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              className="field-check"
            />
            Visible on the storefront
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {draft.id ? 'Save' : 'Add'}
            </button>
            {draft.id ? (
              <button type="button" onClick={() => setDraft(BLANK)} className="btn-ghost">
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <Dialog
        open={presetPicker}
        onClose={() => setPresetPicker(false)}
        title="Start from a template"
        footer={
          <>
            <button type="button" onClick={() => setPresetPicker(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="button" onClick={() => void applyPreset()} disabled={!selectedPreset || presetBusy} className="btn-primary">
              {presetBusy ? 'Applying…' : 'Apply'}
            </button>
          </>
        }
      >
        {presetError ? (
          <p role="alert" className="notice notice-error mb-4">
            {presetError}
          </p>
        ) : null}

        <div className="space-y-4">
          <div>
            <p className="field-label mb-2">Pick a starting taxonomy</p>
            {!presets ? (
              <p className="text-sm text-neutral-900/60">Loading templates…</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {presets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => void choosePreset(preset)}
                    className={cn(
                      'rounded border p-3 text-start text-sm',
                      selectedPreset?.key === preset.key
                        ? 'border-accent bg-accent/5'
                        : 'border-neutral-200 hover:bg-neutral-50',
                    )}
                  >
                    <span className="block font-medium text-neutral-900">{preset.label}</span>
                    {preset.description ? (
                      <span className="mt-0.5 block text-xs text-neutral-900/60">{preset.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedPreset ? (
            <div className="rounded bg-neutral-50 p-3 text-sm">
              {presetPreview ? (
                <>
                  <p className="text-neutral-900">
                    Will create <strong>{presetPreview.created}</strong> new categor{presetPreview.created === 1 ? 'y' : 'ies'}.
                  </p>
                  {presetPreview.collisions.length > 0 ? (
                    <p className="mt-1 text-neutral-900/70">
                      Already exists, left unchanged: {presetPreview.collisions.join(', ')} — this template&apos;s own
                      children still apply underneath them.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-neutral-900/60">Checking what this would create…</p>
              )}
            </div>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

/**
 * Flattens the category list into parent-then-children order, carrying a
 * depth so the table can indent.
 *
 * The API returns a flat array ordered by parentId, which renders as one
 * undifferentiated list — a sub-category looks exactly like a top-level one,
 * so the tree you built is invisible on the screen where you build it.
 *
 * Anything whose parent is missing from the list (deactivated, or filtered
 * out) is treated as top level rather than dropped, so a category can never
 * disappear from this table because of its parent.
 */
function asTree(categories: AdminCategory[]): Array<{ category: AdminCategory; depth: number }> {
  const byParent = new Map<string | null, AdminCategory[]>();
  const ids = new Set(categories.map((category) => category.id));

  for (const category of categories) {
    const parent = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(category);
    byParent.set(parent, siblings);
  }

  const rows: Array<{ category: AdminCategory; depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = [...(byParent.get(parentId) ?? [])].sort(
      (a, b) => a.order - b.order || a.slug.localeCompare(b.slug),
    );
    for (const category of children) {
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);

  return rows;
}
