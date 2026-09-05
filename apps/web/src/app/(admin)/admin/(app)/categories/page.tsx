'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { DataTable } from '@/components/ui';
import type { AdminCategory } from '@/types/api';

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
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Categories</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        How the storefront navigation is organised. Both languages are shown to customers.
      </p>

      {error ? (
        <p role="alert" className="card mb-4 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <DataTable
              rows={categories}
              rowKey={(category) => category.id}
              emptyLabel="No categories yet."
              columns={[
                {
                  header: 'Name',
                  cell: (category) => (
                    <>
                      <span className="font-medium text-neutral-900">
                        {category.translations.find((t) => t.locale === 'en')?.name ??
                          category.slug}
                      </span>
                      <p className="text-xs text-neutral-900/40">
                        {category.slug}
                        {category.isActive ? '' : ' · hidden'}
                      </p>
                    </>
                  ),
                },
                {
                  header: 'Urdu',
                  muted: true,
                  className: 'font-urdu',
                  cell: (category) => (
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
                  cell: (category) => category._count.products,
                },
                {
                  header: '',
                  align: 'end',
                  cell: (category) => (
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
              className="rounded border-neutral-200 text-accent-hover focus:ring-accent"
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
    </>
  );
}
