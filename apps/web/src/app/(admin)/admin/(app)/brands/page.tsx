'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin-client';
import { Badge, DataTable } from '@/components/ui';
import type { AdminBrand } from '@/types/api';

interface Draft {
  id?: string;
  slug: string;
  nameEn: string;
  nameUr: string;
  logoUrl: string;
  order: string;
  isActive: boolean;
}

const BLANK: Draft = {
  slug: '',
  nameEn: '',
  nameUr: '',
  logoUrl: '',
  order: '0',
  isActive: true,
};

/**
 * The brand list.
 *
 * Brands used to be free text on each product, so the catalogue accumulated
 * "Gul Ahmed", "gul ahmed" and "Gul  Ahmed" as three separate things. This is
 * the one place they are created and renamed; the product editor picks from
 * here rather than accepting typing.
 */
export default function AdminBrandsPage() {
  const [brands, setBrands] = useState<AdminBrand[] | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBrands(await adminFetch<AdminBrand[]>('/admin/catalog/brands'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load brands');
      setBrands([]);
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
      logoUrl: draft.logoUrl.trim() || undefined,
      order: Number(draft.order) || 0,
      isActive: draft.isActive,
      translations: [
        { locale: 'en' as const, name: draft.nameEn.trim() },
        ...(draft.nameUr.trim() ? [{ locale: 'ur' as const, name: draft.nameUr.trim() }] : []),
      ],
    };

    try {
      if (draft.id) {
        await adminFetch(`/admin/catalog/brands/${draft.id}`, { method: 'PATCH', body: payload });
      } else {
        await adminFetch('/admin/catalog/brands', { method: 'POST', body: payload });
      }
      setDraft(BLANK);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the brand');
    } finally {
      setBusy(false);
    }
  }

  async function remove(brand: AdminBrand) {
    setError(null);
    try {
      await adminFetch(`/admin/catalog/brands/${brand.id}`, { method: 'DELETE' });
      await load();
    } catch (cause) {
      // The API refuses while products still carry the brand, and says how
      // many — surface that rather than a generic failure.
      setError(cause instanceof Error ? cause.message : 'Could not delete the brand');
    }
  }

  function edit(brand: AdminBrand) {
    setDraft({
      id: brand.id,
      slug: brand.slug,
      nameEn: brand.translations.find((t) => t.locale === 'en')?.name ?? '',
      nameUr: brand.translations.find((t) => t.locale === 'ur')?.name ?? '',
      logoUrl: brand.logoUrl ?? '',
      order: String(brand.order),
      isActive: brand.isActive,
    });
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-neutral-900">Brands</h1>
      <p className="mb-6 text-sm text-neutral-900/60">
        The labels products are sold under. A brand still used by a product cannot be
        deleted — deactivate it instead, which keeps it on those products but removes it
        from the product editor&apos;s picker.
      </p>

      {error ? (
        <p role="alert" className="notice notice-error mb-4 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="card overflow-hidden">
          <DataTable
            rows={brands}
            loading={brands === null}
            rowKey={(brand) => brand.id}
            emptyLabel="No brands yet. Add the first one on the right."
            columns={[
              {
                header: 'Name',
                cell: (brand) => (
                  <>
                    <span className="font-medium text-neutral-900">
                      {brand.translations.find((t) => t.locale === 'en')?.name ?? brand.slug}
                    </span>
                    <p className="text-xs text-neutral-900/40">{brand.slug}</p>
                  </>
                ),
              },
              {
                header: 'Urdu',
                muted: true,
                className: 'font-urdu',
                cell: (brand) => (
                  <span dir="rtl">
                    {brand.translations.find((t) => t.locale === 'ur')?.name ?? '—'}
                  </span>
                ),
              },
              {
                header: 'Products',
                align: 'end',
                numeric: true,
                muted: true,
                cell: (brand) => brand._count?.products ?? 0,
              },
              {
                header: 'Status',
                cell: (brand) => (
                  <Badge tone={brand.isActive ? 'success' : 'neutral'}>
                    {brand.isActive ? 'Active' : 'Hidden'}
                  </Badge>
                ),
              },
              {
                header: '',
                align: 'end',
                cell: (brand) => (
                  <>
                    <button
                      type="button"
                      onClick={() => edit(brand)}
                      className="rounded px-2 py-1 text-xs text-accent-hover hover:bg-neutral-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(brand)}
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

        <form onSubmit={save} className="card h-fit space-y-4 p-4">
          <h2 className="text-sm font-semibold text-neutral-900">
            {draft.id ? 'Edit brand' : 'New brand'}
          </h2>

          <label className="block">
            <span className="field-label">
              Name<span className="text-red-600"> *</span>
            </span>
            <input
              value={draft.nameEn}
              onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
              required
              placeholder="Gul Ahmed"
              className="field-input"
            />
          </label>

          <label className="block">
            <span className="field-label">نام</span>
            <input
              value={draft.nameUr}
              onChange={(event) => setDraft({ ...draft, nameUr: event.target.value })}
              dir="rtl"
              className="field-input font-urdu"
            />
            <span className="mt-1 block text-xs text-neutral-900/40">
              Optional. Most brand names read the same in both languages; leave it blank
              and the storefront falls back to the English one.
            </span>
          </label>

          <label className="block">
            <span className="field-label">Logo URL</span>
            <input
              value={draft.logoUrl}
              onChange={(event) => setDraft({ ...draft, logoUrl: event.target.value })}
              placeholder="https://…"
              className="field-input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Order</span>
              <input
                type="number"
                value={draft.order}
                onChange={(event) => setDraft({ ...draft, order: event.target.value })}
                className="field-input"
              />
            </label>

            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                className="field-check"
              />
              Active
            </label>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add brand'}
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
