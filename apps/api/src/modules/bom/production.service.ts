import { BadRequestException, Injectable, MethodNotAllowedException, NotFoundException } from '@nestjs/common';
import { weightedAverageCost } from '@newax/shared';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { AppConfigService } from '../../core/config/app-config.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { documentNumber, documentNumberPrefix } from '../../core/settings/document-number';
import { documentPrefix } from '../../core/settings/document-prefix';
import { SettingsService } from '../../core/settings/settings.service';
import { InventoryService } from '../inventory/inventory.service';
import type { CreateProductionRunDto, ProductionRunQueryDto } from './dto/production-run.dto';
import type { Prisma } from '../../core/prisma/client';

const PRODUCTION_RUN_NUMBER_LOCK_NAMESPACE = 8_241_140;

async function nextProductionRunNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'productionRun');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PRODUCTION_RUN_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "BomProductionRun"
    WHERE "number" LIKE ${`${like}%`}
  `;
  const nextSequence = (max ?? 0) + 1;
  return documentNumber(config, prefix, year, nextSequence);
}

const runInclude = {
  recipe: { select: { id: true, variantId: true, outputQuantity: true, wastageBps: true } },
  variant: { select: { id: true, sku: true, label: true } },
  operator: { select: { id: true, firstName: true, lastName: true } },
  lines: {
    include: { rawMaterial: { select: { id: true, name: true, variant: { select: { sku: true } } } } },
  },
} satisfies Prisma.BomProductionRunInclude;

type RunWithLines = Prisma.BomProductionRunGetPayload<{ include: typeof runInclude }>;

/**
 * The step that makes BOM real: a run consumes raw stock and credits
 * finished stock, both through InventoryService — a direct Prisma write to
 * the variant's stock field appears nowhere in this file — and rolls the
 * finished variant's costPrice forward through the SAME
 * weightedAverageCost() helper purchasing uses, so a manufactured unit
 * flows into COGS/margin exactly like a bought one, with zero changes to
 * orders/analytics/reports (WO-C.3, 10-admin-dashboard.md §C).
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
  ) {}

  async list(query: ProductionRunQueryDto): Promise<PaginatedResult<ReturnType<ProductionService['toSummary']>>> {
    const where: Prisma.BomProductionRunWhereInput = {
      ...(query.recipeId ? { recipeId: query.recipeId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.bomProductionRun.findMany({
        where,
        include: runInclude,
        orderBy: { producedAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.bomProductionRun.count({ where }),
    ]);

    return paginated(rows.map((row) => this.toSummary(row)), total, query);
  }

  async get(id: string) {
    const run = await this.prisma.bomProductionRun.findUnique({ where: { id }, include: runInclude });
    if (!run) throw new NotFoundException('That production run no longer exists.');
    return this.toDetail(run);
  }

  /** Ledger history — never deleted. A correction is a reversing adjustment through the normal inventory screen. */
  remove(): never {
    throw new MethodNotAllowedException(
      'A production run cannot be deleted — it is ledger history. Record a reversing adjustment through the inventory screen instead.',
    );
  }

  async create(dto: CreateProductionRunDto, actorId: string | null) {
    const created = await this.prisma.$transaction(async (tx) => {
      const recipe = await tx.bomRecipe.findUnique({
        where: { id: dto.recipeId },
        include: { components: { include: { rawMaterial: { include: { variant: true } } } } },
      });
      if (!recipe) throw new NotFoundException('That recipe no longer exists.');
      if (recipe.status !== 'ACTIVE') {
        throw new BadRequestException('Only an ACTIVE recipe can be produced.');
      }

      const outputVariant = await tx.productVariant.findUniqueOrThrow({ where: { id: recipe.variantId } });

      const runs = dto.runs ?? 1;
      const quantityProduced = runs * recipe.outputQuantity;

      const consumption = recipe.components.map((component) => {
        const effectiveBps = component.wastageBps ?? recipe.wastageBps;
        const perBatchBaseQty = Math.ceil((component.quantityBase * (10000 + effectiveBps)) / 10000);
        const totalBaseQty = perBatchBaseQty * runs;
        const unitCost = component.rawMaterial.variant.costPrice;
        return { component, totalBaseQty, unitCost, lineCost: totalBaseQty * unitCost };
      });

      const materialCost = consumption.reduce((sum, line) => sum + line.lineCost, 0);
      const labourCost = recipe.labourCost * quantityProduced;
      const overheadCost = recipe.overheadCost * quantityProduced;
      const producedUnitCost = Math.round((materialCost + labourCost + overheadCost) / quantityProduced);

      const number = await nextProductionRunNumber(tx, this.settings, this.config);
      const locationId = dto.locationId || (await this.inventory.defaultLocationId(tx));

      const run = await tx.bomProductionRun.create({
        data: {
          number,
          recipeId: recipe.id,
          variantId: recipe.variantId,
          runs,
          quantityProduced,
          materialCost,
          labourCost,
          overheadCost,
          producedUnitCost,
          notes: dto.notes?.trim() || null,
          operatorId: actorId,
          locationId,
          scopeLevel: dto.scopeLevel ?? 'BRAND',
          originNodeId: this.config.nodeId,
        },
      });

      // Consume raw stock — InsufficientStockError (a 400 naming the short
      // material) rolls back this entire transaction, including the run row
      // just created above.
      await this.inventory.moveMany(
        consumption.map((line) => ({
          variantId: line.component.rawMaterial.variant.id,
          locationId,
          delta: -line.totalBaseQty,
          reason: 'ADJUSTMENT',
          refType: 'BomProductionRun',
          refId: run.id,
          unitCost: line.unitCost,
          actorId,
        })),
        tx,
      );

      await tx.bomProductionLine.createMany({
        data: consumption.map((line) => ({
          runId: run.id,
          rawMaterialId: line.component.rawMaterialId,
          variantId: line.component.rawMaterial.variant.id,
          quantityBase: line.totalBaseQty,
          unitCost: line.unitCost,
          lineCost: line.lineCost,
        })),
      });

      // Credit finished stock.
      const producedMovement = await this.inventory.move(
        {
          variantId: recipe.variantId,
          locationId,
          delta: quantityProduced,
          reason: 'ADJUSTMENT',
          refType: 'BomProductionRun',
          refId: run.id,
          unitCost: producedUnitCost,
          actorId,
        },
        tx,
      );

      // The keystone: the SAME weighted-average helper purchasing uses, so a
      // manufactured unit costs exactly like a bought one with no second
      // costing path (10-admin-dashboard.md WO-C.3's own words).
      const stockBefore = producedMovement.resultingStock - quantityProduced;
      const newCost = weightedAverageCost(stockBefore, outputVariant.costPrice, quantityProduced, producedUnitCost);
      await tx.productVariant.update({ where: { id: recipe.variantId }, data: { costPrice: newCost } });

      await this.events.publish(
        DomainEvent.BomProductionCompleted,
        {
          runId: run.id,
          number: run.number,
          recipeId: recipe.id,
          variantId: recipe.variantId,
          quantityProduced,
          producedUnitCost,
          operatorId: actorId,
          scopeLevel: run.scopeLevel,
          originNodeId: run.originNodeId,
          producedAtIso: run.producedAt.toISOString(),
        },
        tx,
      );

      return tx.bomProductionRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
    });

    return this.toDetail(created);
  }

  private toSummary(run: RunWithLines) {
    return {
      id: run.id,
      number: run.number,
      recipeId: run.recipeId,
      variantId: run.variantId,
      sku: run.variant.sku,
      runs: run.runs,
      quantityProduced: run.quantityProduced,
      producedUnitCost: run.producedUnitCost,
      producedAt: run.producedAt,
    };
  }

  private toDetail(run: RunWithLines) {
    return {
      id: run.id,
      number: run.number,
      recipeId: run.recipeId,
      variantId: run.variantId,
      sku: run.variant.sku,
      runs: run.runs,
      quantityProduced: run.quantityProduced,
      materialCost: run.materialCost,
      labourCost: run.labourCost,
      overheadCost: run.overheadCost,
      producedUnitCost: run.producedUnitCost,
      notes: run.notes,
      operatorId: run.operatorId,
      producedAt: run.producedAt,
      createdAt: run.createdAt,
      lines: run.lines.map((line) => ({
        id: line.id,
        rawMaterialId: line.rawMaterialId,
        name: line.rawMaterial.name,
        sku: line.rawMaterial.variant.sku,
        quantityBase: line.quantityBase,
        unitCost: line.unitCost,
        lineCost: line.lineCost,
      })),
    };
  }
}
