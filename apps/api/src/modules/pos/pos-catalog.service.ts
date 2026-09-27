import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface PosVariantResult {
  variantId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  nameEn: string;
  unitPrice: number;
  stock: number;
}

export interface PosSellableRecipeResult {
  recipeId: string;
  variantId: string;
  sku: string;
  nameEn: string;
  unitPrice: number;
}

/**
 * A till's product lookup — sku/barcode/name search, scoped to what a
 * cashier actually needs on screen (RETAIL-ERP.md R11). A dedicated,
 * `pos.operate`-gated read rather than reusing `admin/catalog/products`
 * (`catalog.manage`) or `admin/inventory` (`inventory.manage`): a cashier
 * ringing up a sale should not need either admin-tier permission just to
 * find an item. Queries Prisma directly rather than importing
 * CatalogService/InventoryService — the same "same shared database, no
 * cross-module service import" pattern `OrdersService.placeFromPos()`
 * already uses for the identical reason (check-module-boundaries.mjs flags
 * a cross-module service/module import, not table access).
 */
@Injectable()
export class PosCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async searchVariants(locationId: string, term: string): Promise<PosVariantResult[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];

    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        OR: [
          { sku: { contains: trimmed, mode: 'insensitive' } },
          { barcode: { equals: trimmed } },
          {
            product: {
              translations: {
                some: { locale: DEFAULT_LOCALE, name: { contains: trimmed, mode: 'insensitive' } },
              },
            },
          },
        ],
      },
      include: {
        product: {
          include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } },
        },
        locationStocks: { where: { locationId } },
      },
      take: 20,
      orderBy: { sku: 'asc' },
    });

    return variants.map((variant) => ({
      variantId: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      barcode: variant.barcode,
      nameEn: variant.product.translations[0]?.name ?? variant.product.slug,
      unitPrice: variant.priceOverride ?? variant.product.basePrice,
      stock: variant.locationStocks[0]?.quantity ?? 0,
    }));
  }

  /**
   * pos-hardware/31 §1/WO-31.4 — read-only "use this recipe" picker for a
   * `BOM_RECIPE_SCALE` line (paint tinting, bakery formulas). A direct
   * Prisma read, not a `BomModule` import — `BomModule` exports nothing
   * today, and this is the same "same shared database, no cross-module
   * service import" precedent this file already sets for `searchVariants()`
   * (no `KNOWN_MODULE_COUPLINGS` entry needed for a plain read). Only
   * `ACTIVE` recipes are sellable — a `DRAFT`/`ARCHIVED` recipe has no
   * settled formula/cost a cashier should scale at the till.
   */
  async listSellableRecipes(): Promise<PosSellableRecipeResult[]> {
    const recipes = await this.prisma.bomRecipe.findMany({
      where: { status: 'ACTIVE' },
      include: {
        variant: {
          include: { product: { include: { translations: { where: { locale: DEFAULT_LOCALE }, take: 1 } } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return recipes.map((recipe) => ({
      recipeId: recipe.id,
      variantId: recipe.variantId,
      sku: recipe.variant.sku,
      nameEn: recipe.variant.product.translations[0]?.name ?? recipe.variant.product.slug,
      unitPrice: recipe.variant.priceOverride ?? recipe.variant.product.basePrice,
    }));
  }
}
