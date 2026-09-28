'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/utils/cn';
import { PRODUCT_KINDS, PRODUCT_STATUSES, generateSku, formatMoney, toMajor, toMinor } from '@newax/shared';
import { Wizard, type WizardStep } from '@/components/common/wizard';
import { Disclosure } from '@/components/ui';
import { adminFetch } from '@/lib/admin-client';
import { useAdminSession } from '@/components/admin/session';
import { useEnabledModules } from '@/components/admin/deployment-modules';
import { isModuleEnabled } from '@/utils/module-gate';
import type {
  AdminBrand,
  AdminCategory,
  AdminProduct,
  AdminProductOption,
  AdminOptionTemplate,
  AdminVariant,
  GarmentType,
  ProductReferenceLookup,
} from '@/types/api';
import { ImageManager, ImageStager, uploadStagedImages, type StagedImage } from './image-manager';
import { CrossSellManager } from './cross-sell-manager';

const KIND_LABELS: Record<string, string> = {
  GOODS: 'Goods',
  SERVICE: 'Service',
  DIGITAL: 'Digital product',
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
  skuIsManual: boolean;
  barcode: string;
  costPrice: string;
  reorderPoint: string;
  reorderQuantity: string;
  lotTracked: boolean;
  tracksSerials: boolean;
  warrantyMonths: string;
}

const BLANK_VARIANT: VariantDraft = {
  sku: '',
  size: '',
  color: '',
  colorHex: '',
  stock: '0',
  priceOverride: '',
  isActive: true,
  skuIsManual: false,
  barcode: '',
  costPrice: '',
  reorderPoint: '',
  reorderQuantity: '',
  lotTracked: false,
  tracksSerials: false,
  warrantyMonths: '',
};

interface ProductFormProps {
  product?: AdminProduct;
  categories: AdminCategory[];
  garmentTypes: GarmentType[];
  brands: AdminBrand[];
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
export function ProductForm({ product, categories, garmentTypes, brands }: ProductFormProps) {
  const router = useRouter();

  // Set once a create request succeeds. Distinct from `product` (the prop,
  // fixed for this component's lifetime) so the form can flip from "creating"
  // to "editing" in place after the product exists — without a navigation —
  // if a staged photo failed to upload and the user needs ImageManager's
  // retry button rather than being sent away from the error.
  const [createdProduct, setCreatedProduct] = useState<AdminProduct | null>(null);
  const effectiveProduct = product ?? createdProduct;
  const isEdit = Boolean(effectiveProduct);

  const englishTranslation = product?.translations.find((t) => t.locale === 'en');
  const urduTranslation = product?.translations.find((t) => t.locale === 'ur');

  // WO-3.1's option axes — only meaningful once the product has an id, same
  // constraint as Images. Loaded once here rather than duplicated per step.
  const [options, setOptions] = useState<AdminProductOption[]>(product?.options ?? []);
  const [templates, setTemplates] = useState<AdminOptionTemplate[]>([]);

  useEffect(() => {
    adminFetch<AdminOptionTemplate[]>('/admin/catalog/option-templates').then(setTemplates).catch(() => undefined);
  }, []);

  const reloadOptions = useCallback(async () => {
    if (!effectiveProduct) return;
    try {
      setOptions(await adminFetch<AdminProductOption[]>(`/admin/catalog/products/${effectiveProduct.id}/options`));
    } catch {
      // Non-fatal — the section just shows what it last had.
    }
  }, [effectiveProduct]);

  const [kind, setKind] = useState(product?.kind ?? 'UNSTITCHED');
  const [status, setStatus] = useState(product?.status ?? 'DRAFT');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [basePrice, setBasePrice] = useState(
    product ? String(toMajor(product.basePrice)) : '',
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    product?.compareAtPrice ? String(toMajor(product.compareAtPrice)) : '',
  );
  const [brandId, setBrandId] = useState(product?.brandId ?? '');
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
  const [isConsumable, setIsConsumable] = useState(product?.isConsumable ?? false);
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

  // WO-3.7 — the SEO section. Meta fields per locale, plus the two toggles
  // that only ever apply site-wide-rarely, so they live here rather than
  // getting their own step.
  const [metaTitleEn, setMetaTitleEn] = useState(englishTranslation?.metaTitle ?? '');
  const [metaTitleUr, setMetaTitleUr] = useState(urduTranslation?.metaTitle ?? '');
  const [metaDescriptionEn, setMetaDescriptionEn] = useState(englishTranslation?.metaDescription ?? '');
  const [metaDescriptionUr, setMetaDescriptionUr] = useState(urduTranslation?.metaDescription ?? '');
  const [focusKeywordEn, setFocusKeywordEn] = useState(englishTranslation?.focusKeyword ?? '');
  const [focusKeywordUr, setFocusKeywordUr] = useState(urduTranslation?.focusKeyword ?? '');
  const [noindex, setNoindex] = useState(product?.noindex ?? false);
  const [canonicalOverride, setCanonicalOverride] = useState(product?.canonicalOverride ?? '');
  const [code, setCode] = useState(product?.code ?? '');

  const { can } = useAdminSession();
  const canViewCost = can('inventory.view_cost');
  const enabledModules = useEnabledModules();
  const marketplaceEnabled = isModuleEnabled('marketplace', enabledModules);

  const [variants, setVariants] = useState<VariantDraft[]>(
    product?.variants.length ? product.variants.map(toDraft) : [{ ...BLANK_VARIANT }],
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only used when creating: photos picked before the product has an id.
  // Uploaded in onSubmit, right after the create request returns one — see
  // ImageStager's doc comment for why this exists instead of a second trip.
  const [pendingImages, setPendingImages] = useState<StagedImage[]>([]);
  /*
   * Whether the photo grid is mid-upload or holding a failure.
   *
   * Saving is blocked while either is true. Choosing a photo and hitting save
   * a second later used to store the product without it — the upload was
   * still in flight, nothing waited for it, and the only sign was a photo
   * that quietly never appeared.
   */
  const [imageUpload, setImageUpload] = useState({ busy: false, failed: false });

  // Duplicate SKUs and duplicate size/colour combinations both reach the API
  // fine syntactically but collide there — one against a global unique
  // constraint, one silently overwriting stock. Flagging them here, live, is
  // cheaper for staff than a round trip to find out.
  const variantIssues = useMemo(() => findVariantIssues(variants), [variants]);

  // 166-unified-product-reference-registry.md WO-166.3 — the barcode
  // autofill. Keyed by variant index: `status` drives what the row shows,
  // `reference` is the preview once found, `outcome` is what to do after
  // this save succeeds (adopt a found reference, or register a genuinely
  // new barcode) — resolved once here rather than re-checked on save, since
  // the barcode itself is what was just looked up.
  const [referenceChecks, setReferenceChecks] = useState<
    Record<number, { status: 'checking' | 'match' | 'none'; barcode: string; reference?: ProductReferenceLookup; accepted?: boolean }>
  >({});

  const checkBarcode = useCallback(async (index: number, barcode: string) => {
    if (!marketplaceEnabled) return;
    const trimmed = barcode.trim();
    if (!/^\d{8,14}$/.test(trimmed)) return; // not barcode-shaped — no wasted round trip
    setReferenceChecks((current) => ({ ...current, [index]: { status: 'checking', barcode: trimmed } }));
    try {
      const reference = await adminFetch<ProductReferenceLookup>('/admin/marketplace/product-references/lookup', {
        query: { barcode: trimmed },
      });
      setReferenceChecks((current) => ({ ...current, [index]: { status: 'match', barcode: trimmed, reference } }));
    } catch {
      // 404 (no match) and "marketplace not configured for this deployment"
      // both land here — either way, the form behaves exactly as it does
      // today, per doc 166's own "absent collaborator" lens.
      setReferenceChecks((current) => ({ ...current, [index]: { status: 'none', barcode: trimmed } }));
    }
  }, [marketplaceEnabled]);

  function acceptReference(index: number) {
    const check = referenceChecks[index];
    if (!check?.reference) return;
    const en = check.reference.translations.find((t) => t.locale === 'en');
    const ur = check.reference.translations.find((t) => t.locale === 'ur');
    if (en) {
      setNameEn(en.name);
      setDescriptionEn(en.description ?? '');
      setCareEn(en.careInstructions ?? '');
    }
    if (ur) {
      setNameUr(ur.name);
      setDescriptionUr(ur.description ?? '');
      setCareUr(ur.careInstructions ?? '');
    }
    setReferenceChecks((current) => ({ ...current, [index]: { ...check, accepted: true } }));
  }

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

  async function onSubmit() {
    setError(null);

    if (variantIssues.duplicateSkus.size > 0 || variantIssues.duplicateCombos.size > 0) {
      setError('Fix the duplicate variants highlighted below before saving.');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        kind,
        status,
        categoryId: categoryId || undefined,
        basePrice: toMinor(Number(basePrice)),
        compareAtPrice: compareAtPrice ? toMinor(Number(compareAtPrice)) : undefined,
        brandId: brandId || undefined,
        fabric: fabric || undefined,
        season: season || undefined,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        featuredRank: Number(featuredRank) || 0,
        isConsumable,
        // These only apply to unstitched fabric; sending them for another kind
        // is rejected by the API on purpose.
        pieceCount: isUnstitched && pieceCount ? Number(pieceCount) : undefined,
        fabricMeters: isUnstitched && fabricMeters ? Number(fabricMeters) : undefined,
        stitchingAvailable: isUnstitched ? stitchingAvailable : undefined,
        // UNSTITCHED: which garments this fabric can become. STITCHED: which
        // garments' size charts this ready-to-wear product should show.
        garmentTypeIds: isUnstitched || kind === 'STITCHED' ? garmentTypeIds : undefined,
        garmentTypeId: isService ? serviceGarmentId : undefined,
        code: code.trim() || undefined,
        noindex,
        canonicalOverride: canonicalOverride.trim() || undefined,
        translations: [
          {
            locale: 'en' as const,
            name: nameEn.trim(),
            description: descriptionEn.trim() || undefined,
            careInstructions: careEn.trim() || undefined,
            metaTitle: metaTitleEn.trim() || undefined,
            metaDescription: metaDescriptionEn.trim() || undefined,
            focusKeyword: focusKeywordEn.trim() || undefined,
          },
          ...(nameUr.trim()
            ? [
                {
                  locale: 'ur' as const,
                  name: nameUr.trim(),
                  description: descriptionUr.trim() || undefined,
                  careInstructions: careUr.trim() || undefined,
                  metaTitle: metaTitleUr.trim() || undefined,
                  metaDescription: metaDescriptionUr.trim() || undefined,
                  focusKeyword: focusKeywordUr.trim() || undefined,
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
            skuIsManual: variant.skuIsManual,
            barcode: variant.barcode.trim() || undefined,
            costPrice: variant.costPrice ? toMinor(Number(variant.costPrice)) : undefined,
            reorderPoint: variant.reorderPoint ? Number(variant.reorderPoint) : undefined,
            reorderQuantity: variant.reorderQuantity ? Number(variant.reorderQuantity) : undefined,
            lotTracked: variant.lotTracked,
            tracksSerials: variant.tracksSerials,
            warrantyMonths: variant.warrantyMonths ? Number(variant.warrantyMonths) : undefined,
          })),
      };

      const wasCreate = !isEdit;
      const saved = isEdit
        ? await adminFetch<AdminProduct>(`/admin/catalog/products/${effectiveProduct!.id}`, {
            method: 'PATCH',
            body: payload,
          })
        : await adminFetch<AdminProduct>('/admin/catalog/products', {
            method: 'POST',
            body: payload,
          });

      // 166-unified-product-reference-registry.md WO-166.3 — close the loop
      // now that the product's own translations/variants are saved: adopt
      // any shared listing the staff accepted, and silently register any
      // genuinely new barcode so the next business finds it instead of a
      // blank form. Best-effort and never surfaced: the product above
      // already saved successfully regardless of what happens here.
      if (marketplaceEnabled) {
        await Promise.allSettled(
          Object.entries(referenceChecks).map(([indexStr, check]) => {
            if (check.status === 'checking') return Promise.resolve();
            const draft = variants[Number(indexStr)];
            const savedVariant = draft && saved.variants.find((v) => v.sku === draft.sku.trim());
            if (!savedVariant) return Promise.resolve();

            if (check.status === 'match' && check.accepted) {
              return adminFetch('/admin/marketplace/product-references/apply', {
                method: 'POST',
                body: { variantId: savedVariant.id },
              });
            }
            if (check.status === 'none') {
              return adminFetch('/admin/marketplace/product-references/register', {
                method: 'POST',
                body: { variantId: savedVariant.id },
              });
            }
            return Promise.resolve();
          }),
        );
      }

      // The product now has an id, so any photos picked during the Images
      // step can finally be sent. Failures here are reported but never undo
      // the product that was just created — see uploadStagedImages's comment.
      if (wasCreate && pendingImages.length > 0) {
        const result = await uploadStagedImages(saved.id, pendingImages);
        setPendingImages([]);
        if (result.failed > 0) {
          // Flip to edit mode in place, on this same page, rather than
          // navigating away: the Images step now renders the real
          // ImageManager against `saved.id`, so the retry button for the
          // failed upload is right there instead of on a page the user has
          // to be told to go find.
          setCreatedProduct(saved);
          setError(
            `Product created, but ${result.failed} of ${result.uploaded + result.failed} photo(s) ` +
              `failed to upload` +
              (result.firstError ? ` (${result.firstError})` : '') +
              '. Retry from the Images step below.',
          );
          setSaving(false);
          return;
        }
      }

      router.push(`/admin/products/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the product');
      setSaving(false);
    }
  }

  const basicsStep: WizardStep = {
    id: 'basics',
    label: 'What is this?',
    isValid: true,
    content: (
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

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isConsumable}
            onChange={(event) => setIsConsumable(event.target.checked)}
            className="field-check"
          />
          Consumable / repeat-buy — worth an automated reorder nudge (Marketing settings)
        </label>
      </Section>
    ),
  };

  const nameStep: WizardStep = {
    id: 'name',
    label: 'Name',
    isValid: Boolean(nameEn.trim()),
    content: (
      <Section
        title="Name and description"
        description="Urdu is optional but the storefront falls back to English without it."
      >
        <div className="grid gap-4 fold:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">English</p>
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
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60" dir="ltr">
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
    ),
  };

  const pricingStep: WizardStep = {
    id: 'pricing',
    label: 'Pricing',
    isValid: Boolean(basePrice.trim()),
    content: (
      <Section title="Pricing" description="Enter rupees; the system stores exact paisa.">
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
    ),
  };

  const kindDetailsStep: WizardStep = isService
    ? {
        id: 'kind-details',
        label: 'Service details',
        isValid: Boolean(serviceGarmentId),
        content: (
          <Section title="Service details">
          <Field
            label="Garment this service stitches"
            hint="The fee above replaces the garment's standard stitching price when a customer picks this service."
            required
          >
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
                  {garment.stitchingPrice > 0
                    ? ` · standard ${formatMoney(garment.stitchingPrice)}`
                    : ''}
                </option>
              ))}
            </select>
          </Field>
        </Section>
        ),
      }
    : isUnstitched
      ? {
          id: 'kind-details',
          label: 'Fabric details',
          isValid: true,
          content: (
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
              className="field-check"
            />
            Offer &ldquo;get it stitched&rdquo; on this fabric
          </label>

          {stitchingAvailable ? (
            <fieldset className="mt-4">
              <legend className="field-label">Can be stitched as</legend>
              <p className="mb-2 text-xs text-neutral-900/60">
                Tick every garment this cloth can be made into. The customer sees these
                choices with the fee shown here; fees are set per garment on the Garments
                page.
              </p>
              <div className="flex flex-wrap gap-2">
                {garmentTypes.map((garment) => {
                  // The storefront only lists a garment that is active AND still offered
                  // for stitching, so the editor greys out anything it would hide — a
                  // retired garment attached here would look live but never appear.
                  const offered = garment.isActive && garment.stitchingEnabled;
                  const selected = garmentTypeIds.includes(garment.id);
                  // One already attached before the garment was retired stays
                  // untickable so it can be cleaned up — only new ones are barred.
                  const locked = !offered && !selected;

                  return (
                    <label
                      key={garment.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                        selected ? 'border-accent bg-neutral-50' : 'border-neutral-100',
                        offered ? 'text-neutral-900' : 'bg-neutral-50 text-neutral-900/60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={locked}
                        onChange={(event) =>
                          setGarmentTypeIds((current) =>
                            event.target.checked
                              ? [...current, garment.id]
                              : current.filter((id) => id !== garment.id),
                          )
                        }
                        className="field-check"
                      />
                      {garment.labelEn}
                      {offered ? (
                        <span
                          className={cn(
                            'text-xs',
                            garment.stitchingPrice > 0 ? 'text-neutral-900/60' : 'text-red-700',
                          )}
                        >
                          {garment.stitchingPrice > 0
                            ? formatMoney(garment.stitchingPrice)
                            : 'no fee set'}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-900/60">not offered</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {garmentTypeIds.length === 0 ? (
                <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  No garment ticked, so the customer will not see a stitching option on
                  this fabric.
                </p>
              ) : null}
            </fieldset>
          ) : null}
        </Section>
          ),
        }
      : {
          id: 'kind-details',
          label: 'Attributes',
          isValid: true,
          content: (
        <Section title="Attributes">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Brand"
              hint="Managed under Brands — pick one rather than typing, so the same label is not stored three different ways"
            >
              <select
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
                className="field-input"
              >
                <option value="">No brand</option>
                {brands.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.translations.find((t) => t.locale === 'en')?.name ?? option.slug}
                  </option>
                ))}
                {/* A brand that has since been deactivated stays selectable on
                    a product already using it, so opening and saving an old
                    product does not silently clear its brand. */}
                {brandId && !brands.some((option) => option.id === brandId) ? (
                  <option value={brandId}>(brand no longer listed)</option>
                ) : null}
              </select>
            </Field>
            {/* Fabric/season/size chart are apparel-specific (GOODS/SERVICE/DIGITAL
                have no garment to size). */}
            {kind === 'STITCHED' ? (
              <>
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
              </>
            ) : null}
          </div>

          {kind === 'STITCHED' ? (
            <fieldset className="mt-4">
              <legend className="field-label">Size chart</legend>
              <p className="mb-2 text-xs text-neutral-900/60">
                Tick the garment(s) this outfit is made of. The customer sees a &ldquo;Size
                chart&rdquo; link on the product page showing each garment&apos;s standard
                measurements — set under Garments.
              </p>
              <div className="flex flex-wrap gap-2">
                {garmentTypes.map((garment) => {
                  const selected = garmentTypeIds.includes(garment.id);
                  return (
                    <label
                      key={garment.id}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
                        selected ? 'border-accent bg-neutral-50 text-neutral-900' : 'border-neutral-100 text-neutral-900/70',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setGarmentTypeIds((current) =>
                            event.target.checked
                              ? [...current, garment.id]
                              : current.filter((id) => id !== garment.id),
                          )
                        }
                        className="field-check"
                      />
                      {garment.labelEn}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </Section>
          ),
        };

  const tagsStep: WizardStep = {
    id: 'tags',
    label: 'Tags',
    isValid: true,
    content: (
      <Section title="Tags" description="Comma separated; used by search and merchandising.">
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          className="field-input max-w-lg"
          placeholder="embroidered, summer, festive"
        />
      </Section>
    ),
  };

  const seoStep: WizardStep = {
    id: 'seo',
    label: 'SEO',
    isValid: true,
    content: (
      <Section
        title="SEO"
        description="Left blank, the storefront falls back to the name and description above. WO-3.7's publish gate needs both filled in before this product can go Active."
      >
        <div className="grid gap-4 fold:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">English</p>
            <Field label="Meta title" hint={`${metaTitleEn.length}/70`}>
              <input
                value={metaTitleEn}
                onChange={(event) => setMetaTitleEn(event.target.value)}
                maxLength={70}
                className="field-input"
              />
            </Field>
            <Field label="Meta description" hint={`${metaDescriptionEn.length}/180`}>
              <textarea
                value={metaDescriptionEn}
                onChange={(event) => setMetaDescriptionEn(event.target.value)}
                maxLength={180}
                rows={3}
                className="field-input"
              />
            </Field>
            <Field label="Focus keyword" hint="Internal only — never shown to a customer">
              <input
                value={focusKeywordEn}
                onChange={(event) => setFocusKeywordEn(event.target.value)}
                className="field-input"
              />
            </Field>
          </div>

          <div className="space-y-4" dir="rtl">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60" dir="ltr">
              Urdu
            </p>
            <Field label="میٹا عنوان" dir="rtl">
              <input
                value={metaTitleUr}
                onChange={(event) => setMetaTitleUr(event.target.value)}
                maxLength={70}
                className="field-input font-urdu"
              />
            </Field>
            <Field label="میٹا تفصیل" dir="rtl">
              <textarea
                value={metaDescriptionUr}
                onChange={(event) => setMetaDescriptionUr(event.target.value)}
                maxLength={180}
                rows={3}
                className="field-input font-urdu"
              />
            </Field>
            <Field label="اہم لفظ" dir="rtl">
              <input
                value={focusKeywordUr}
                onChange={(event) => setFocusKeywordUr(event.target.value)}
                className="field-input font-urdu"
              />
            </Field>
          </div>
        </div>

        <Disclosure label="Advanced (code, canonical, noindex)">
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <Field label="SKU-template code" hint="Defaults from the slug if left blank">
              <input value={code} onChange={(event) => setCode(event.target.value)} className="field-input" />
            </Field>
            <Field label="Canonical URL override" hint="Rare — leave blank unless this page duplicates another">
              <input
                value={canonicalOverride}
                onChange={(event) => setCanonicalOverride(event.target.value)}
                className="field-input"
              />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={noindex}
              onChange={(event) => setNoindex(event.target.checked)}
              className="field-check"
            />
            Hide from search engines (noindex)
          </label>
        </Disclosure>
      </Section>
    ),
  };

  const variantsStep: WizardStep = {
    id: 'variants',
    label: 'Variants',
    isValid: variantIssues.duplicateSkus.size === 0 && variantIssues.duplicateCombos.size === 0,
    content: (
      <Section
        title="Variants"
        description="One row per size/colour. Every row needs a unique SKU; a removed row is deactivated, not deleted, so past orders stay intact."
      >
        {effectiveProduct ? (
          <OptionsManager
            productId={effectiveProduct.id}
            options={options}
            templates={templates}
            onChange={reloadOptions}
          />
        ) : (
          <p className="mb-4 rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-900/60">
            Custom options (beyond size/colour) can be added once this product is created.
          </p>
        )}

        <div className="space-y-3">
          {variants.map((variant, index) => {
            const duplicateSku = variantIssues.duplicateSkus.has(index);
            const duplicateCombo = variantIssues.duplicateCombos.has(index);

            return (
            <div
              key={variant.id ?? index}
              className={cn(
                'grid gap-3 rounded-md border p-3 sm:grid-cols-6',
                variant.isActive ? 'border-neutral-100' : 'border-neutral-100 bg-neutral-50 opacity-60',
              )}
            >
              <div>
                <div className="flex items-end gap-1">
                  <div className="flex-1">
                    <LabelledInput
                      label="SKU"
                      value={variant.sku}
                      onChange={(value) =>
                        updateVariant(setVariants, index, { sku: value, skuIsManual: true })
                      }
                      placeholder="LWN-3PC-BLU-M"
                      invalid={duplicateSku}
                    />
                  </div>
                  <button
                    type="button"
                    title="Generate from product code, size and colour"
                    onClick={() => {
                      const generated = generateSku(
                        {
                          template: '{PRODUCT}-{OPT}-{SEQ}',
                          productCode: code || nameEn || 'ITEM',
                          optionValueKeys: [variant.size, variant.color].filter(Boolean),
                        },
                        variants.map((v) => v.sku).filter((sku) => sku !== variant.sku),
                      );
                      updateVariant(setVariants, index, { sku: generated, skuIsManual: false });
                    }}
                    className="mb-0.5 rounded px-1.5 py-1.5 text-xs text-neutral-900/60 hover:bg-neutral-100"
                  >
                    ⟳
                  </button>
                </div>
                {duplicateSku ? (
                  <p className="mt-1 text-xs text-red-700">Used by another variant below.</p>
                ) : null}
              </div>
              <div>
                <LabelledInput
                  label="Size"
                  value={variant.size}
                  onChange={(value) => updateVariant(setVariants, index, { size: value })}
                  placeholder="M"
                  invalid={duplicateCombo}
                />
              </div>
              <div>
                <LabelledInput
                  label="Colour"
                  value={variant.color}
                  onChange={(value) => updateVariant(setVariants, index, { color: value })}
                  placeholder="Ferozi"
                  invalid={duplicateCombo}
                />
                {duplicateCombo ? (
                  <p className="mt-1 text-xs text-red-700">Same size/colour used below.</p>
                ) : null}
              </div>
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

              <div className="sm:col-span-6">
                <Disclosure label="Barcode, cost & reorder">
                  <div className="grid gap-3 pt-2 sm:grid-cols-4">
                    <div>
                      <LabelledInput
                        label="Barcode"
                        value={variant.barcode}
                        onChange={(value) => {
                          updateVariant(setVariants, index, { barcode: value });
                          setReferenceChecks((current) => {
                            if (!current[index]) return current;
                            const next = { ...current };
                            delete next[index];
                            return next;
                          });
                        }}
                        onBlur={() => checkBarcode(index, variant.barcode)}
                        placeholder="EAN-13 / UPC-A"
                      />
                      {marketplaceEnabled ? <BarcodeReferencePreview check={referenceChecks[index]} onAccept={() => acceptReference(index)} /> : null}
                    </div>
                    {canViewCost ? (
                      <LabelledInput
                        label="Cost price (Rs)"
                        type="number"
                        value={variant.costPrice}
                        onChange={(value) => updateVariant(setVariants, index, { costPrice: value })}
                        placeholder="0"
                      />
                    ) : null}
                    <LabelledInput
                      label="Reorder point"
                      type="number"
                      value={variant.reorderPoint}
                      onChange={(value) => updateVariant(setVariants, index, { reorderPoint: value })}
                    />
                    <LabelledInput
                      label="Reorder quantity"
                      type="number"
                      value={variant.reorderQuantity}
                      onChange={(value) => updateVariant(setVariants, index, { reorderQuantity: value })}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={variant.lotTracked}
                        onChange={(event) => updateVariant(setVariants, index, { lotTracked: event.target.checked })}
                        className="field-check"
                      />
                      Batch/lot tracked
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={variant.tracksSerials}
                        onChange={(event) => updateVariant(setVariants, index, { tracksSerials: event.target.checked })}
                        className="field-check"
                      />
                      Serial-number tracked
                    </label>
                    {variant.tracksSerials ? (
                      <LabelledInput
                        label="Warranty (months)"
                        type="number"
                        value={variant.warrantyMonths}
                        onChange={(value) => updateVariant(setVariants, index, { warrantyMonths: value })}
                        placeholder="0"
                      />
                    ) : null}
                  </div>
                </Disclosure>
              </div>
            </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setVariants((current) => [...current, { ...BLANK_VARIANT }])}
          className="btn-secondary mt-3"
        >
          Add variant
        </button>
      </Section>
    ),
  };

  const imagesStep: WizardStep = {
    id: 'images',
    label: 'Images',
    isValid: true,
    content: effectiveProduct ? (
      <Section title="Images" description="The first image is the listing thumbnail.">
        <ImageManager
          productId={effectiveProduct.id}
          initialImages={effectiveProduct.images}
          onUploadState={setImageUpload}
        />
      </Section>
    ) : (
      <Section
        title="Images"
        description="Uploaded together with the rest of this product when you hit Create product below."
      >
        <ImageStager images={pendingImages} onChange={setPendingImages} />
      </Section>
    ),
  };

  const crossSellsStep: WizardStep = {
    id: 'cross-sells',
    label: 'Related products',
    isValid: true,
    content: effectiveProduct ? (
      <Section
        title="Related products"
        description={
          'A manual pick always wins over the algorithm on the storefront\'s "Complete the look" and ' +
          '"Frequently bought together" sections. Leave it empty and those fill in automatically once ' +
          'customers start buying and browsing.'
        }
      >
        <CrossSellManager productId={effectiveProduct.id} />
      </Section>
    ) : (
      <Section title="Related products" description="Available once this product has been created.">
        <p className="text-sm text-neutral-900/60">Save this product first, then come back to pair it manually.</p>
      </Section>
    ),
  };

  const steps: WizardStep[] = [
    basicsStep,
    nameStep,
    pricingStep,
    kindDetailsStep,
    tagsStep,
    variantsStep,
    imagesStep,
    crossSellsStep,
    seoStep,
  ];

  return (
    <div className="space-y-4 pb-16">
      {error ? (
        <p role="alert" className="notice notice-error whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="card p-4 sm:p-5">
        <Wizard
          steps={steps}
          onSubmit={onSubmit}
          submitLabel={
            saving
              ? 'Saving…'
              : imageUpload.busy
                ? 'Uploading photos…'
                : imageUpload.failed
                  ? 'Fix the photo upload first'
                  : isEdit
                    ? 'Save changes'
                    : 'Create product'
          }
          submitBusy={saving || imageUpload.busy}
          // A photo still uploading, or one that failed, blocks the save —
          // the button says which, because a disabled control with no reason
          // is indistinguishable from a broken one.
          submitDisabled={saving || imageUpload.busy || imageUpload.failed}
          accentClassName="bg-accent-hover text-white"
        />
      </div>

      <button type="button" onClick={() => router.back()} className="btn-ghost">
        Cancel
      </button>
    </div>
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
    skuIsManual: variant.skuIsManual,
    barcode: variant.barcode ?? '',
    costPrice: variant.costPrice ? String(toMajor(variant.costPrice)) : '',
    reorderPoint: variant.reorderPoint !== null ? String(variant.reorderPoint) : '',
    reorderQuantity: variant.reorderQuantity !== null ? String(variant.reorderQuantity) : '',
    lotTracked: variant.lotTracked,
    tracksSerials: variant.tracksSerials,
    warrantyMonths: variant.warrantyMonths !== null ? String(variant.warrantyMonths) : '',
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

interface VariantIssues {
  duplicateSkus: Set<number>;
  duplicateCombos: Set<number>;
}

/** Mirrors the checks apps/api's assertUniqueSkus runs server-side, so the editor can flag them before submitting. Blank-SKU rows are ignored — they're dropped on submit, same as there. */
function findVariantIssues(variants: VariantDraft[]): VariantIssues {
  const relevant = variants
    .map((variant, index) => ({ variant, index }))
    .filter(({ variant }) => variant.sku.trim());

  const skuKey = (variant: VariantDraft) => variant.sku.trim().toUpperCase();
  const comboKey = (variant: VariantDraft) =>
    `${variant.size.trim().toUpperCase()} ${variant.color.trim().toUpperCase()}`;

  const skuCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();
  for (const { variant } of relevant) {
    skuCounts.set(skuKey(variant), (skuCounts.get(skuKey(variant)) ?? 0) + 1);
    comboCounts.set(comboKey(variant), (comboCounts.get(comboKey(variant)) ?? 0) + 1);
  }

  const duplicateSkus = new Set<number>();
  const duplicateCombos = new Set<number>();
  for (const { variant, index } of relevant) {
    if ((skuCounts.get(skuKey(variant)) ?? 0) > 1) duplicateSkus.add(index);
    if ((comboCounts.get(comboKey(variant)) ?? 0) > 1) duplicateCombos.add(index);
  }

  return { duplicateSkus, duplicateCombos };
}

/**
 * A step's heading and its content.
 *
 * This used to be a local `Section` that drew `card p-4 sm:p-5` — inside a
 * wizard that is itself a card. Every step of adding a product showed a box
 * drawn immediately inside another box, two borders a few pixels apart with
 * nothing between them. It also shadowed the shared `Section` in
 * components/ui by name, which is the parallel-system failure: two
 * components, one name, one of them boxed and one not, and which you got
 * depended on which file you were in.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      {description ? (
        <p className="mt-1 text-xs text-neutral-900/60">{description}</p>
      ) : null}
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
      {hint ? <span className="mt-1 block text-xs text-neutral-900/60">{hint}</span> : null}
    </label>
  );
}

function LabelledInput({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-900/60">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        className={cn(
          'field-input py-1.5 text-sm',
          invalid && 'border-red-400 focus:border-red-500',
        )}
      />
    </label>
  );
}

/**
 * 166-unified-product-reference-registry.md WO-166.3 — "a match shows a
 * preview... before writing anything." A genuinely new barcode (`status:
 * 'none'`) needs no message at all: this document's own text says the form
 * "behaves exactly as it does today", and it does — the product's own save
 * silently registers it afterward (see `product-form.tsx`'s own `onSubmit`).
 */
function BarcodeReferencePreview({
  check,
  onAccept,
}: {
  check: { status: 'checking' | 'match' | 'none'; reference?: ProductReferenceLookup; accepted?: boolean } | undefined;
  onAccept: () => void;
}) {
  if (!check || check.status === 'none') return null;

  if (check.status === 'checking') {
    return <p className="mt-1 text-xs text-neutral-900/60">Checking the shared registry…</p>;
  }

  if (check.accepted) {
    return <p className="mt-1 text-xs text-emerald-700">Filled from the shared listing.</p>;
  }

  const name = check.reference?.translations.find((t) => t.locale === 'en')?.name ?? check.reference?.translations[0]?.name;
  const image = check.reference?.images[0];

  return (
    <div className="mt-1 flex items-center gap-2 rounded bg-neutral-50 p-1.5">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- a remote registry URL, not a Next-optimizable local asset.
        <img src={image.url} alt="" className="h-8 w-8 rounded object-cover" />
      ) : null}
      <p className="flex-1 text-xs text-neutral-900/70">Already in the shared registry as “{name}”.</p>
      <button type="button" onClick={onAccept} className="btn-text shrink-0 text-xs">
        Fill from shared listing
      </button>
    </div>
  );
}

/**
 * WO-3.1's own promise: a boutique adds a custom option ("Sleeve length")
 * from here, no migration and no developer. Values attach to variants
 * through ProductVariantOptionValue once the storefront read-switch
 * (`catalog.use_option_model_reads`, WO-3.2) is flipped — until then this
 * still records the data correctly, it just is not yet the storefront's
 * source of truth for a non-size/colour axis.
 */
function OptionsManager({
  productId,
  options,
  templates,
  onChange,
}: {
  productId: string;
  options: AdminProductOption[];
  templates: AdminOptionTemplate[];
  onChange: () => void;
}) {
  const [labelEn, setLabelEn] = useState('');
  const [values, setValues] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addCustom(event: React.FormEvent) {
    event.preventDefault();
    if (!labelEn.trim()) return;
    setBusy(true);
    setError(null);

    const valueList = values
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      await adminFetch(`/admin/catalog/products/${productId}/options`, {
        method: 'POST',
        body: {
          key: labelEn.trim().toLowerCase().replace(/\s+/g, '_'),
          translations: [{ locale: 'en', label: labelEn.trim() }],
          values: valueList.map((value) => ({
            key: value.toLowerCase().replace(/\s+/g, '_'),
            translations: [{ locale: 'en', label: value }],
          })),
        },
      });
      setLabelEn('');
      setValues('');
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this option');
    } finally {
      setBusy(false);
    }
  }

  async function instantiate() {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/catalog/products/${productId}/options/instantiate`, {
        method: 'POST',
        body: { templateId },
      });
      setTemplateId('');
      onChange();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this template');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 rounded-md bg-neutral-50 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-900/60">
        Options & attributes
      </h3>

      {options.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {options.map((option) => (
            <li key={option.id} className="rounded bg-white px-2 py-1 text-xs">
              <span className="font-medium">
                {option.translations.find((t) => t.locale === 'en')?.label ?? option.key}
              </span>
              :{' '}
              {option.values
                .map((value) => value.translations.find((t) => t.locale === 'en')?.label ?? value.key)
                .join(', ') || '—'}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-neutral-900/60">No custom options yet — this product uses size/colour only.</p>
      )}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {templates.length > 0 ? (
          <div className="flex items-end gap-1.5">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-900/60">From template</span>
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className="field-input py-1.5 text-sm"
              >
                <option value="">Choose…</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.translations.find((t) => t.locale === 'en')?.label ?? template.key}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={busy || !templateId} onClick={() => void instantiate()} className="btn-secondary py-1.5 text-xs">
              Add
            </button>
          </div>
        ) : null}

        <form onSubmit={addCustom} className="flex items-end gap-1.5">
          <LabelledInput label="Custom option" value={labelEn} onChange={setLabelEn} placeholder="Sleeve length" />
          <LabelledInput label="Values" value={values} onChange={setValues} placeholder="Short, Long" />
          <button type="submit" disabled={busy || !labelEn.trim()} className="btn-secondary py-1.5 text-xs">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
