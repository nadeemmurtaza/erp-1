import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { computeRecipeCost, type RecipeCostResult } from './cost-rollup';
import type { BomComponentDto, CreateRecipeDto, RecipeQueryDto, UpdateRecipeDto } from './dto/recipe.dto';
import type { BomStatus, Prisma } from '../../core/prisma/client';

const recipeInclude = {
  variant: { select: { id: true, sku: true, label: true, productId: true, stock: true } },
  components: {
    include: { rawMaterial: { include: { variant: { select: { id: true, sku: true, stock: true, costPrice: true } } } } },
    orderBy: { order: 'asc' },
  },
} satisfies Prisma.BomRecipeInclude;

type RecipeWithComponents = Prisma.BomRecipeGetPayload<{ include: typeof recipeInclude }>;

export interface MissingVariantRow {
  id: string;
  sku: string;
  productId: string;
}

export interface RecipeListItem {
  id: string;
  variantId: string;
  sku: string;
  label: string | null;
  status: BomStatus;
  version: number;
  outputQuantity: number;
  componentCount: number;
  rolledUpUnitCost: number;
  costComplete: boolean;
  costComputedAt: Date | null;
  updatedAt: Date;
}

/**
 * The recipe for one finished ProductVariant and the cost it rolls up to
 * (WO-C.2, 10-admin-dashboard.md §C). The rollup itself is cost-rollup.ts's
 * pure function; this service's job is fetching what it needs, persisting
 * the cache, and enforcing the no-nesting rule schema alone cannot express.
 */
@Injectable()
export class RecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: RecipeQueryDto): Promise<PaginatedResult<RecipeListItem | MissingVariantRow>> {
    const filter = query.filter ?? 'all';

    if (filter === 'missing') {
      return this.missingVariants(query);
    }

    const where: Prisma.BomRecipeWhereInput = {
      ...(filter === 'active' ? { status: 'ACTIVE' } : {}),
      ...(filter === 'incomplete-cost' ? { costComplete: false } : {}),
      ...(query.q
        ? {
            variant: {
              OR: [
                { sku: { contains: query.q, mode: 'insensitive' } },
                { product: { translations: { some: { name: { contains: query.q, mode: 'insensitive' } } } } },
              ],
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.bomRecipe.findMany({
        where,
        include: recipeInclude,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.bomRecipe.count({ where }),
    ]);

    return paginated(rows.map((row) => this.toListItem(row)), total, query);
  }

  async get(id: string) {
    const recipe = await this.prisma.bomRecipe.findUnique({ where: { id }, include: recipeInclude });
    if (!recipe) throw new NotFoundException('That recipe no longer exists.');
    return this.toDetail(recipe);
  }

  async create(dto: CreateRecipeDto, actorId: string) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
    if (!variant) throw new BadRequestException('That variant does not exist.');

    const existing = await this.prisma.bomRecipe.findUnique({ where: { variantId: dto.variantId } });
    if (existing) {
      throw new ConflictException('This variant already has a recipe. Edit the existing one instead.');
    }

    const components = dto.components ?? [];

    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertComponentsValid(components, dto.variantId, tx);

      const recipe = await tx.bomRecipe.create({
        data: {
          variantId: dto.variantId,
          outputQuantity: dto.outputQuantity ?? 1,
          wastageBps: dto.wastageBps ?? 0,
          labourCost: dto.labourCost ?? 0,
          overheadCost: dto.overheadCost ?? 0,
          notes: dto.notes?.trim() || null,
          createdById: actorId,
          components: { create: components.map((component) => this.componentData(component)) },
        },
      });

      await this.recomputeWithin(recipe.id, tx);

      return tx.bomRecipe.findUniqueOrThrow({ where: { id: recipe.id }, include: recipeInclude });
    });

    return this.toDetail(created);
  }

  async update(id: string, dto: UpdateRecipeDto) {
    const existing = await this.prisma.bomRecipe.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That recipe no longer exists.');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.components) {
        await this.assertComponentsValid(dto.components, existing.variantId, tx);
        await tx.bomComponent.deleteMany({ where: { recipeId: id } });
        if (dto.components.length > 0) {
          await tx.bomComponent.createMany({
            data: dto.components.map((component) => ({ recipeId: id, ...this.componentData(component) })),
          });
        }
      }

      await tx.bomRecipe.update({
        where: { id },
        data: {
          ...(dto.outputQuantity !== undefined ? { outputQuantity: dto.outputQuantity } : {}),
          ...(dto.wastageBps !== undefined ? { wastageBps: dto.wastageBps } : {}),
          ...(dto.labourCost !== undefined ? { labourCost: dto.labourCost } : {}),
          ...(dto.overheadCost !== undefined ? { overheadCost: dto.overheadCost } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        },
      });

      await this.recomputeWithin(id, tx);

      return tx.bomRecipe.findUniqueOrThrow({ where: { id }, include: recipeInclude });
    });

    return this.toDetail(updated);
  }

  /** 400 unless at least one non-optional component — an empty or all-optional recipe produces nothing real. */
  async activate(id: string) {
    const recipe = await this.prisma.bomRecipe.findUnique({ where: { id }, include: { components: true } });
    if (!recipe) throw new NotFoundException('That recipe no longer exists.');

    if (!recipe.components.some((component) => !component.isOptional)) {
      throw new BadRequestException('A recipe needs at least one non-optional component before it can be activated.');
    }

    const updated = await this.prisma.bomRecipe.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: recipeInclude,
    });
    return this.toDetail(updated);
  }

  async archive(id: string) {
    const recipe = await this.prisma.bomRecipe.findUnique({ where: { id } });
    if (!recipe) throw new NotFoundException('That recipe no longer exists.');

    const updated = await this.prisma.bomRecipe.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: recipeInclude,
    });
    return this.toDetail(updated);
  }

  /** Live per-component breakdown — recomputed fresh, not read from the rolledUpUnitCost cache. */
  async costBreakdown(id: string) {
    const recipe = await this.prisma.bomRecipe.findUnique({ where: { id }, include: recipeInclude });
    if (!recipe) throw new NotFoundException('That recipe no longer exists.');

    const result = this.compute(recipe);

    return {
      recipeId: recipe.id,
      outputQuantity: recipe.outputQuantity,
      labourCost: recipe.labourCost,
      overheadCost: recipe.overheadCost,
      materialCost: result.materialCost,
      rolledUpUnitCost: result.rolledUpUnitCost,
      costComplete: result.costComplete,
      components: result.components.map((component) => {
        const source = recipe.components.find((c) => c.rawMaterialId === component.rawMaterialId);
        return {
          rawMaterialId: component.rawMaterialId,
          name: source?.rawMaterial.name,
          sku: source?.rawMaterial.variant.sku,
          isOptional: component.isOptional,
          quantityBase: component.quantityBase,
          effectiveBps: component.effectiveBps,
          componentBaseQty: component.componentBaseQty,
          rawMaterialCostPrice: component.rawMaterialCostPrice,
          componentCost: component.componentCost,
        };
      }),
    };
  }

  /** `{ canProduce, maxRuns, shortages }` against current raw-material stock. */
  async availability(id: string, quantity?: number) {
    const recipe = await this.prisma.bomRecipe.findUnique({ where: { id }, include: recipeInclude });
    if (!recipe) throw new NotFoundException('That recipe no longer exists.');

    const outputQuantity = recipe.outputQuantity > 0 ? recipe.outputQuantity : 1;
    const requestedQuantity = quantity ?? outputQuantity;
    const nonOptional = recipe.components.filter((component) => !component.isOptional);

    const shortages: Array<{
      rawMaterialId: string;
      name: string;
      sku: string;
      neededBase: number;
      availableBase: number;
      shortfallBase: number;
    }> = [];

    let maxRuns = Number.POSITIVE_INFINITY;

    for (const component of nonOptional) {
      const effectiveBps = component.wastageBps ?? recipe.wastageBps;
      const componentBaseQty = Math.ceil((component.quantityBase * (10000 + effectiveBps)) / 10000);
      const neededBase = Math.ceil((componentBaseQty * requestedQuantity) / outputQuantity);
      const availableBase = component.rawMaterial.variant.stock;

      if (componentBaseQty > 0) {
        maxRuns = Math.min(maxRuns, Math.floor(availableBase / componentBaseQty));
      }

      if (availableBase < neededBase) {
        shortages.push({
          rawMaterialId: component.rawMaterialId,
          name: component.rawMaterial.name,
          sku: component.rawMaterial.variant.sku,
          neededBase,
          availableBase,
          shortfallBase: neededBase - availableBase,
        });
      }
    }

    return {
      canProduce: shortages.length === 0,
      maxRuns: Number.isFinite(maxRuns) ? maxRuns : 0,
      shortages,
    };
  }

  /** Backs GET /admin/bom/missing — the two buckets a merchandiser must not have to discover in a meeting. */
  async missingSummary() {
    const missing = await this.missingVariantRows();

    const incompleteCostRows = await this.prisma.bomRecipe.findMany({
      where: { status: 'ACTIVE', costComplete: false },
      include: { variant: { select: { id: true, sku: true, productId: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      missing,
      incompleteCost: incompleteCostRows.map((recipe) => ({
        id: recipe.variant.id,
        sku: recipe.variant.sku,
        productId: recipe.variant.productId,
        recipeId: recipe.id,
      })),
      counts: { missing: missing.length, incompleteCost: incompleteCostRows.length },
    };
  }

  /**
   * Backfill for a variant manufactured before BOM existed — its costPrice
   * is 0, overstating gross profit. A business decision is a button the
   * owner presses, not a migration that runs itself (10-admin-dashboard.md
   * WO-C.3): only fires where costPrice really is 0 (never overwrites a
   * real cost) and costComplete is true (never seeds a cost that is itself
   * a lie), and leaves an AuditLog entry naming what changed.
   */
  async seedCostPrice(id: string, actorId: string | null) {
    const recipe = await this.prisma.bomRecipe.findUnique({ where: { id }, include: { variant: true } });
    if (!recipe) throw new NotFoundException('That recipe no longer exists.');

    if (recipe.variant.costPrice !== 0 || !recipe.costComplete) {
      return { changed: false, variantId: recipe.variantId, costPrice: recipe.variant.costPrice };
    }

    await this.prisma.productVariant.update({
      where: { id: recipe.variantId },
      data: { costPrice: recipe.rolledUpUnitCost },
    });

    await this.audit.record({
      actorId,
      action: 'bom.recipe.cost_price_seeded',
      entity: 'ProductVariant',
      entityId: recipe.variantId,
      data: { from: 0, to: recipe.rolledUpUnitCost, recipeId: recipe.id },
    });

    return { changed: true, variantId: recipe.variantId, costPrice: recipe.rolledUpUnitCost };
  }

  /**
   * Recomputes and persists the rollup for one recipe, in its own
   * transaction. The public entry point for bom.listener.ts, which has no
   * transaction of its own to join — create()/update() use the internal
   * recomputeWithin() instead, so the rollup lands in the SAME transaction
   * as the edit that changed it.
   */
  async recompute(recipeId: string): Promise<RecipeCostResult> {
    return this.prisma.$transaction((tx) => this.recomputeWithin(recipeId, tx));
  }

  private async recomputeWithin(recipeId: string, tx: Prisma.TransactionClient): Promise<RecipeCostResult> {
    const recipe = await tx.bomRecipe.findUniqueOrThrow({ where: { id: recipeId }, include: recipeInclude });
    const result = this.compute(recipe);

    await tx.bomRecipe.update({
      where: { id: recipeId },
      data: {
        rolledUpUnitCost: result.rolledUpUnitCost,
        costComplete: result.costComplete,
        costComputedAt: new Date(),
      },
    });

    return result;
  }

  private compute(recipe: RecipeWithComponents): RecipeCostResult {
    return computeRecipeCost({
      wastageBps: recipe.wastageBps,
      outputQuantity: recipe.outputQuantity,
      labourCost: recipe.labourCost,
      overheadCost: recipe.overheadCost,
      components: recipe.components.map((component) => ({
        rawMaterialId: component.rawMaterialId,
        quantityBase: component.quantityBase,
        wastageBps: component.wastageBps,
        isOptional: component.isOptional,
        rawMaterialCostPrice: component.rawMaterial.variant.costPrice,
      })),
    });
  }

  /**
   * No nesting in v1: a component's raw material may not itself carry a
   * recipe (no sub-assemblies), and a component may not point at the
   * recipe's own output variant (cannot consume yourself).
   */
  private async assertComponentsValid(
    components: BomComponentDto[],
    outputVariantId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (components.length === 0) return;

    const rawMaterialIds = components.map((component) => component.rawMaterialId);
    const duplicates = rawMaterialIds.filter((id, index) => rawMaterialIds.indexOf(id) !== index);
    if (duplicates.length > 0) {
      throw new BadRequestException(
        `Duplicate raw material(s) in this recipe: ${[...new Set(duplicates)].join(', ')}`,
      );
    }

    const materials = await tx.rawMaterial.findMany({
      where: { id: { in: rawMaterialIds } },
      include: { variant: { include: { bomRecipe: true } } },
    });

    if (materials.length !== rawMaterialIds.length) {
      const foundIds = new Set(materials.map((material) => material.id));
      const missing = rawMaterialIds.filter((id) => !foundIds.has(id));
      throw new BadRequestException(`Unknown raw material(s): ${missing.join(', ')}`);
    }

    for (const material of materials) {
      if (material.variantId === outputVariantId) {
        throw new BadRequestException(
          `"${material.name}" is this recipe's own output — a recipe cannot consume itself.`,
        );
      }
      if (material.variant.bomRecipe) {
        throw new BadRequestException(
          `"${material.name}" itself has a recipe — sub-assemblies are not supported (no nesting).`,
        );
      }
    }
  }

  private componentData(component: BomComponentDto) {
    return {
      rawMaterialId: component.rawMaterialId,
      quantityBase: component.quantityBase,
      wastageBps: component.wastageBps ?? null,
      isOptional: component.isOptional ?? false,
      note: component.note?.trim() || null,
      order: component.order ?? 0,
    };
  }

  private async missingVariantRows(): Promise<MissingVariantRow[]> {
    return this.prisma.$queryRaw<MissingVariantRow[]>`
      SELECT v.id, v.sku, p.id AS "productId"
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId"
      LEFT JOIN "BomRecipe"   r  ON r."variantId" = v.id AND r.status = 'ACTIVE'
      LEFT JOIN "RawMaterial" rm ON rm."variantId" = v.id
      WHERE v."isActive" = true
        AND p.status = 'ACTIVE'
        AND p.kind IN ('STITCHED', 'UNSTITCHED')
        AND r.id IS NULL
        AND rm.id IS NULL
      ORDER BY v.sku ASC
    `;
  }

  private async missingVariants(query: RecipeQueryDto): Promise<PaginatedResult<MissingVariantRow>> {
    const all = await this.missingVariantRows();
    const start = query.skip ?? 0;
    const rows = all.slice(start, start + query.take);
    return paginated(rows, all.length, query);
  }

  private toListItem(recipe: RecipeWithComponents): RecipeListItem {
    return {
      id: recipe.id,
      variantId: recipe.variantId,
      sku: recipe.variant.sku,
      label: recipe.variant.label,
      status: recipe.status,
      version: recipe.version,
      outputQuantity: recipe.outputQuantity,
      componentCount: recipe.components.length,
      rolledUpUnitCost: recipe.rolledUpUnitCost,
      costComplete: recipe.costComplete,
      costComputedAt: recipe.costComputedAt,
      updatedAt: recipe.updatedAt,
    };
  }

  private toDetail(recipe: RecipeWithComponents) {
    return {
      id: recipe.id,
      variantId: recipe.variantId,
      sku: recipe.variant.sku,
      label: recipe.variant.label,
      status: recipe.status,
      version: recipe.version,
      outputQuantity: recipe.outputQuantity,
      wastageBps: recipe.wastageBps,
      labourCost: recipe.labourCost,
      overheadCost: recipe.overheadCost,
      rolledUpUnitCost: recipe.rolledUpUnitCost,
      costComplete: recipe.costComplete,
      costComputedAt: recipe.costComputedAt,
      notes: recipe.notes,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
      components: recipe.components.map((component) => ({
        id: component.id,
        rawMaterialId: component.rawMaterialId,
        name: component.rawMaterial.name,
        sku: component.rawMaterial.variant.sku,
        unit: component.rawMaterial.unit,
        unitScale: component.rawMaterial.unitScale,
        quantityBase: component.quantityBase,
        wastageBps: component.wastageBps,
        isOptional: component.isOptional,
        note: component.note,
        order: component.order,
      })),
    };
  }
}
