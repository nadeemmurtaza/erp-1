'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { PRODUCT_KINDS, PRODUCT_STATUSES, toMajor, toMinor } from '@yaseen/shared';
import { adminFetch } from '@/lib/admin-client';
import type {
  AdminCategory,
  AdminProduct,
  AdminVariant,
  GarmentType,
} from '@/lib/api-types';
import { ImageManager } from './image-manager';

const KIND_LABELS: Record<string, string> = {
  STITCHED: 'Ready to wear',
  UNSTITCHED: 'Unstitched fabric',
  STITCHING_SERVICE: 'Stitching service',
};

interface VariantDraft {
  id?: string;
  sku: string;
  size: string;
  color: string;
  colorHex: string;
  stock: string;
  priceOverride: string;
  isActive: boolean;
}

interface ProductFormProps {
  product?: AdminProduct;
  categories: AdminCategory[];
  garmentTypes: GarmentType[];
}

/**
 * One editor for all three product kinds.
 *
 * English and Urdu sit side by side rather than behind a language tab, because
 * a bilingual shop where the second language is one click away is a shop whose
 * second language is half empty.
 *
 * Prices are typed in RUPEES here and converted to paisa on submit — the API
 * and database are integer paisa throughout, and this is the boundary.
 */
export function ProductForm({ product, categories, garmentTypes }: ProductFormProps) {
  const router = useRouter();
  const isEdit = Boolean(product);

  const englishTranslation = product?.translations.find((t) => t.locale === 'en');
  const urduTranslation = product?.translations.find((t) => t.locale === 'ur');

  const [kind, setKind] = useState(product?.kind ?? 'UNSTITCHED');
  const [status, setStatus] = useState(product?.status ?? 'DRAFT');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [basePrice, setBasePrice] = useState(
    product ? String(toMajor(product.basePrice)) : '',
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    product?.compareAtPrice ? String(toMajor(product.compareAtPrice)) : '',
  );
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [fabric, setFabric] = useState(product?.fabric ?? '');
  const [season, setSeason] = useState(product?.season ?? '');
  const [tags, setTags] = useState((product?.tags ?? []).join(', '));
  const [pieceCount, setPieceCount] = useState(
    product?.pieceCount ? String(product.pieceCount) : '',
  );
  const [fabricMeters, setFabricMeters] = useState(
    product?.fabricMeters ? String(product.fabricMeters) : '',
  );
  const [stitchingAvailable, setStitchingAvailable] = useState(
    product?.stitchingAvailable ?? false,
  );
  const [garmentTypeIds, setGarmentTypeIds] = useState<string[]>(
    product?.garmentTypeIds ?? [],
  );
  const [serviceGarmentId, setServiceGarmentId] = useState(product?.garmentTypeId ?? '');
  const [featuredRank, setFeaturedRank] = useState(String(product?.featuredRank ?? 0));

  const [nameEn, setNameEn] = useState(englishTranslation?.name ?? '');
  const [nameUr, setNameUr] = useState(urduTranslation?.name ?? '');
  const [descriptionEn, setDescriptionEn] = useState(englishTranslation?.description ?? '');
  const [descriptionUr, setDescriptionUr] = useState(urduTranslation?.description ?? '');
  const [careEn, setCareEn] = useState(englishTranslation?.careInstructions ?? '');
  const [careUr, setCareUr] = useState(urduTranslation?.careInstructions ?? '');

  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.length
      ? product.variants.map(toDraft)
      : [{ sku: '', size: '', color: '', colorHex: '', stock: '0', priceOverride: '', isActive: true }],
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isUnstitched = kind === 'UNSTITCHED';
  const isService = kind === 'STITCHING_SERVICE';

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        name: category.translations.find((t) => t.locale === 'en')?.name ?? category.slug,
      })),
    [categories],
  );

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const payload = {
        kind,
        status,
        categoryId: categoryId || undefined,
        basePrice: toMinor(Number(basePrice)),
        compareAtPrice: compareAtPrice ? toMinor(Number(compareAtPrice)) : undefined,
        brand: brand || undefined,
        fabric: fabric || undefined,
        season: season || undefined,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        featuredRank: Number(featuredRank) || 0,
        // These only apply to unstitched fabric; sending them for another kind
        // is rejected by the API on purpose.
        pieceCount: isUnstitched && pieceCount ? Number(pieceCount) : undefined,
        fabricMeters: isUnstitched && fabricMeters ? Number(fabricMeters) : undefined,
        stitchingAvailable: isUnstitched ? stitchingAvailable : undefined,
        garmentTypeIds: isUnstitched ? garmentTypeIds : undefined,
        garmentTypeId: isService ? serviceGarmentId : undefined,
        translations: [
          {
            locale: 'en' as const,
            name: nameEn.trim(),
            description: descriptionEn.trim() || undefined,
            careInstructions: careEn.trim() || undefined,
          },
          ...(nameUr.trim()
            ? [
                {
                  locale: 'ur' as const,
                  name: nameUr.trim(),
                  description: descriptionUr.trim() || undefined,
                  careInstructions: careUr.trim() || undefined,
                },
              ]
            : []),
        ],
        variants: variants
          .filter((variant) => variant.sku.trim())
          .map((variant, index) => ({
            id: variant.id,
            sku: variant.sku.trim(),
            size: variant.size.trim() || undefined,
            color: variant.color.trim() || undefined,
            colorHex: variant.colorHex.trim() || undefined,
            stock: Number(variant.stock) || 0,
            priceOverride: variant.priceOverride
              ? toMinor(Number(variant.priceOverride))
              : undefined,
            isActive: variant.isActive,
            order: index,
          })),
      };

      const saved = isEdit
        ? await adminFetch<AdminProduct>(`/admin/catalog/products/${product!.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await adminFetch<AdminProduct>('/admin/catalog/products', {
            method: 'POST',
            body: payload,
          });

      router.push(`/admin/products/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the product');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 pb-16">
      {error ? (
        <p role="alert" className="card whitespace-pre-line p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Section title="What is this?">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kind" hint="Decides which fields below apply">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as typeof kind)}
              className="field-input"
            >
              {PRODUCT_KINDS.map((option) => (
                <option key={option} value={option}>
                  {KIND_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status" hint="Only Active is visible to customers">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="field-input"
            >
              {PRODUCT_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {option.charAt(0) + option.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="field-input"
            >
              <option value="">No category</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section
        title="Name and description"
        hint="Urdu is optional but the storefront falls back to English without it."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">English</p>
            <Field label="Name" required>
              <input
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                required
                className="field-input"
                placeholder="3-Piece Embroidered Lawn Suit"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={descriptionEn}
                onChange={(event) => setDescriptionEn(event.target.value)}
                rows={4}
                className="field-input"
              />
            </Field>
            <Field label="Care instructions">
              <textarea
                value={careEn}
                onChange={(event) => setCareEn(event.target.value)}
                rows={2}
                className="field-input"
              />
            </Field>
          </div>

          <div className="space-y-4" dir="rtl">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40" dir="ltr">
              Urdu
            </p>
            <Field label="نام" dir="rtl">
              <input
                value={nameUr}
                onChange={(event) => setNameUr(event.target.value)}
                className="field-input font-urdu"
                placeholder="تھری پیس کڑھائی والا لان سوٹ"
              />
            </Field>
            <Field label="تفصیل" dir="rtl">
              <textarea
                value={descriptionUr}
                onChange={(event) => setDescriptionUr(event.target.value)}
                rows={4}
                className="field-input font-urdu"
              />
            </Field>
            <Field label="احتیاط" dir="rtl">
              <textarea
                value={careUr}
                onChange={(event) => setCareUr(event.target.value)}
                rows={2}
                className="field-input font-urdu"
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Pricing" hint="Enter rupees; the system stores exact paisa.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={isService ? 'Stitching fee (Rs)' : 'Price (Rs)'} required>
            <input
              type="number"
              min={0}
              step="1"
              value={basePrice}
              onChange={(event) => setBasePrice(event.target.value)}
              required
              className="field-input"
            />
          </Field>
          <Field label="Compare-at price (Rs)" hint="Shown struck through">
            <input
              type="number"
              min={0}
              step="1"
              value={compareAtPrice}
              onChange={(event) => setCompareAtPrice(event.target.value)}
              className="field-input"
            />
          </Field>
          <Field label="Featured rank" hint="Higher floats to the top of listings">
            <input
              type="number"
              value={featuredRank}
              onChange={(event) => setFeaturedRank(event.target.value)}
              className="field-input"
            />
          </Field>
        </div>
      </Section>

      {isService ? (
        <Section title="Service details">
          <Field label="Garment this service stitches" required>
            <select
              value={serviceGarmentId}
              onChange={(event) => setServiceGarmentId(event.target.value)}
              required
              className="field-input max-w-sm"
            >
              <option value="">Choose a garment…</option>
              {garmentTypes.map((garment) => (
                <option key={garment.id} value={garment.id}>
                  {garment.labelEn}
                </option>
              ))}
            </select>
          </Field>
        </Section>
      ) : null}

      {isUnstitched ? (
        <Section title="Fabric details">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Fabric" hint="lawn, chiffon, khaddar…">
              <input
                value={fabric}
                onChange={(event) => setFabric(event.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Season" hint="summer, winter, festive">
              <input
                value={season}
                onChange={(event) => setSeason(event.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Pieces">
              <input
                type="number"
                min={1}
                max={5}
                value={pieceCount}
                onChange={(event) => setPieceCount(event.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Metres of fabric">
              <input
                type="number"
                min={0}
                step="0.25"
                value={fabricMeters}
                onChange={(event) => setFabricMeters(event.target.value)}
                className="field-input"
              />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={stitchingAvailable}
              onChange={(event) => setStitchingAvailable(event.target.checked)}
              className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
            />
            Offer &ldquo;get it stitched&rdquo; on this fabric
          </label>

          {stitchingAvailable ? (
            <fieldset className="mt-4">
              <legend className="field-label">Can be stitched as</legend>
              <div className="flex flex-wrap gap-3">
                {garmentTypes.map((garment) => (
                  <label key={garment.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={garmentTypeIds.includes(garment.id)}
                      onChange={(event) =>
                        setGarmentTypeIds((current) =>
                          event.target.checked
                            ? [...current, garment.id]
                            : current.filter((id) => id !== garment.id),
                        )
                      }
                      className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                    />
                    {garment.labelEn}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </Section>
      ) : null}

      {!isUnstitched && !isService ? (
        <Section title="Attributes">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Brand">
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Fabric">
              <input
                value={fabric}
                onChange={(event) => setFabric(event.target.value)}
                className="field-input"
              />
            </Field>
            <Field label="Season">
              <input
                value={season}
                onChange={(event) => setSeason(event.target.value)}
                className="field-input"
              />
            </Field>
          </div>
        </Section>
      ) : null}

      <Section title="Tags" hint="Comma separated; used by search and merchandising.">
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          className="field-input max-w-lg"
          placeholder="embroidered, summer, festive"
        />
      </Section>

      <Section
        title="Variants"
        hint="One row per size/colour. Every row needs a unique SKU; a removed row is deactivated, not deleted, so past orders stay intact."
      >
        <div className="space-y-3">
          {variants.map((variant, index) => (
            <div
              key={variant.id ?? index}
              className={clsx(
                'grid gap-3 rounded-md border p-3 sm:grid-cols-6',
                variant.isActive ? 'border-sand-200' : 'border-sand-200 bg-sand-50 opacity-60',
              )}
            >
              <LabelledInput
                label="SKU"
                value={variant.sku}
                onChange={(value) => updateVariant(setVariants, index, { sku: value })}
                placeholder="LWN-3PC-BLU-M"
              />
              <LabelledInput
                label="Size"
                value={variant.size}
                onChange={(value) => updateVariant(setVariants, index, { size: value })}
                placeholder="M"
              />
              <LabelledInput
                label="Colour"
                value={variant.color}
                onChange={(value) => updateVariant(setVariants, index, { color: value })}
                placeholder="Ferozi"
              />
              <LabelledInput
                label="Hex"
                value={variant.colorHex}
                onChange={(value) => updateVariant(setVariants, index, { colorHex: value })}
                placeholder="#2e8b9a"
              />
              <LabelledInput
                label="Stock"
                type="number"
                value={variant.stock}
                onChange={(value) => updateVariant(setVariants, index, { stock: value })}
              />
              <div className="flex items-end justify-between gap-2">
                <LabelledInput
                  label="Price (Rs)"
                  type="number"
                  value={variant.priceOverride}
                  onChange={(value) =>
                    updateVariant(setVariants, index, { priceOverride: value })
                  }
                  placeholder="—"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVariants((current) =>
                      current.length === 1
                        ? current
                        : current.filter((_, position) => position !== index),
                    )
                  }
                  className="mb-1 rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  aria-label={`Remove variant ${variant.sku || index + 1}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setVariants((current) => [
              ...current,
              { sku: '', size: '', color: '', colorHex: '', stock: '0', priceOverride: '', isActive: true },
            ])
          }
          className="btn-secondary mt-3"
        >
          Add variant
        </button>
      </Section>

      {product ? (
        <Section title="Images" hint="The first image is the listing thumbnail.">
          <ImageManager productId={product.id} initialImages={product.images} />
        </Section>
      ) : (
        <Section title="Images">
          <p className="text-sm text-ink/60">
            Save the product first, then upload photographs here.
          </p>
        </Section>
      )}

      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-sand-200 bg-white px-4 py-3 sm:-mx-6 sm:px-6">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}

function toDraft(variant: AdminVariant): VariantDraft {
  return {
    id: variant.id,
    sku: variant.sku,
    size: variant.size ?? '',
    color: variant.color ?? '',
    colorHex: variant.colorHex ?? '',
    stock: String(variant.stock),
    priceOverride: variant.priceOverride ? String(toMajor(variant.priceOverride)) : '',
    isActive: variant.isActive,
  };
}

function updateVariant(
  setVariants: React.Dispatch<React.SetStateAction<VariantDraft[]>>,
  index: number,
  patch: Partial<VariantDraft>,
): void {
  setVariants((current) =>
    current.map((variant, position) =>
      position === index ? { ...variant, ...patch } : variant,
    ),
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {hint ? <p className="mt-1 text-xs text-ink/50">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  dir,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  dir?: 'ltr' | 'rtl';
  children: React.ReactNode;
}) {
  return (
    <label className="block" dir={dir}>
      <span className="field-label">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink/40">{hint}</span> : null}
    </label>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink/50">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="field-input py-1.5 text-sm"
      />
    </label>
  );
}
