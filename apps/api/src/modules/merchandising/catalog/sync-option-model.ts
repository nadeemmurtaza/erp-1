import type { PrismaClient, Prisma } from '../../../core/prisma/client';

/** Whatever Prisma client this runs against — a live request's open transaction, or a standalone script's own instance. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * WO-3.1 (03-variants-sku-seo.md, Blocker B2) — derives the
 * ProductOption/ProductOptionValue/ProductVariantOptionValue model from the
 * legacy size/color/colorHex columns on ProductVariant.
 *
 * Originally a one-shot backfill script (`prisma/backfill-product-options.ts`,
 * which now just calls this); WO-3.2 promotes it to the dual-write path too —
 * product-admin.service.ts calls this same function, scoped to one product
 * via `productIds`, inside the same transaction that just wrote that
 * product's variants, so the two models can never drift apart. One function,
 * two callers, never a second implementation of this mapping.
 *
 * Additive and idempotent: never touches size/color/colorHex (expand/
 * contract, 00-HOUSE-RULES.md §4 — those columns stay until an owner flips
 * `catalog.use_option_model_reads`, WO-3.2). Safe to re-run — every write is
 * an upsert keyed on the same compound unique the schema enforces, so running
 * it twice, or on every save, is a no-op once the data already matches.
 *
 * Per product: one "size" option (BUTTON) and one "colour" option (SWATCH,
 * colorHex -> swatchHex), each with one value per DISTINCT size/color found
 * on that product's variants, in the order the variants define them. Value
 * labels are the raw string in both locales — Urdu needs a human pass
 * afterwards, this does not guess a translation (doc's own instruction).
 * ProductVariant.label is written to match the exact format
 * orders.service.ts already produces for OrderItem.variantLabel:
 * [size, color].filter(Boolean).join(' / ').
 */
export async function syncOptionModel(
  prisma: PrismaLike,
  options?: { productIds?: string[] },
): Promise<{ productsTouched: number; variantsTouched: number }> {
  const products = await prisma.product.findMany({
    where: options?.productIds ? { id: { in: options.productIds } } : undefined,
    include: { variants: { orderBy: { order: 'asc' } } },
  });

  let productsTouched = 0;
  let variantsTouched = 0;

  for (const product of products) {
    const variants = product.variants;
    const hasSize = variants.some((v) => v.size);
    const hasColor = variants.some((v) => v.color);
    if (!hasSize && !hasColor) continue;

    const sizeOptionId = hasSize ? await upsertOption(prisma, product.id, 'size', 'BUTTON', 0, 'Size', 'سائز') : null;
    const colorOptionId = hasColor
      ? await upsertOption(prisma, product.id, 'color', 'SWATCH', 1, 'Colour', 'رنگ')
      : null;

    const sizeValueIdByKey = sizeOptionId
      ? await upsertDistinctValues(prisma, sizeOptionId, variants, (v) => v.size)
      : new Map<string, string>();
    const colorValueIdByKey = colorOptionId
      ? await upsertDistinctValues(prisma, colorOptionId, variants, (v) => v.color, (v) => v.colorHex)
      : new Map<string, string>();

    for (const variant of variants) {
      const joinRows: Array<{ variantId: string; optionId: string; valueId: string }> = [];
      if (sizeOptionId && variant.size) {
        joinRows.push({
          variantId: variant.id,
          optionId: sizeOptionId,
          valueId: sizeValueIdByKey.get(variant.size)!,
        });
      }
      if (colorOptionId && variant.color) {
        joinRows.push({
          variantId: variant.id,
          optionId: colorOptionId,
          valueId: colorValueIdByKey.get(variant.color)!,
        });
      }
      if (joinRows.length === 0) continue;

      for (const row of joinRows) {
        await prisma.productVariantOptionValue.upsert({
          where: { variantId_optionId: { variantId: row.variantId, optionId: row.optionId } },
          update: { valueId: row.valueId },
          create: row,
        });
      }

      const label = [variant.size, variant.color].filter(Boolean).join(' / ') || null;
      if (variant.label !== label) {
        await prisma.productVariant.update({ where: { id: variant.id }, data: { label } });
      }
      variantsTouched++;
    }

    productsTouched++;
  }

  return { productsTouched, variantsTouched };
}

async function upsertOption(
  prisma: PrismaLike,
  productId: string,
  key: 'size' | 'color',
  display: 'BUTTON' | 'SWATCH',
  order: number,
  labelEn: string,
  labelUr: string,
): Promise<string> {
  const option = await prisma.productOption.upsert({
    where: { productId_key: { productId, key } },
    update: {},
    create: {
      productId,
      key,
      display,
      order,
      translations: {
        create: [
          { locale: 'en', label: labelEn },
          { locale: 'ur', label: labelUr },
        ],
      },
    },
  });
  return option.id;
}

/** Distinct values, in the order the variants define them (first appearance). */
async function upsertDistinctValues(
  prisma: PrismaLike,
  optionId: string,
  variants: Array<{ size: string | null; color: string | null; colorHex: string | null }>,
  pick: (v: { size: string | null; color: string | null; colorHex: string | null }) => string | null,
  swatchHexFor?: (v: { size: string | null; color: string | null; colorHex: string | null }) => string | null,
): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();
  const seen = new Set<string>();
  let order = 0;

  for (const variant of variants) {
    const key = pick(variant);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const value = await prisma.productOptionValue.upsert({
      where: { optionId_key: { optionId, key } },
      update: {},
      create: {
        optionId,
        key,
        swatchHex: swatchHexFor?.(variant) ?? null,
        order: order++,
        translations: {
          create: [
            { locale: 'en', label: key },
            { locale: 'ur', label: key },
          ],
        },
      },
    });
    idByKey.set(key, value.id);
  }

  return idByKey;
}
