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
import { LotsService } from '../inventory/lots.service';
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
  outputLot: { select: { id: true, lotCode: true } },
  lines: {
    include: {
      rawMaterial: { select: { id: true, name: true, variant: { select: { sku: true } } } },
      lotAllocations: { include: { lot: { select: { id: true, lotCode: true } } } },
    },
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
    private readonly lots: LotsService,
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

  /**
   * 71-recipe-batch-traceability.md §3, WO-71.3 — "what went into this
   * finished batch." A single join over rows §2 already writes at
   * production time: BomProductionRun.outputLotId -> its own lines ->
   * BomProductionLineLot -> Lot. Never recomputed or inferred — a recall
   * reads exactly what was written, nothing walked backward from stock.
   */
  async traceOutputLot(lotId: string) {
    const run = await this.prisma.bomProductionRun.findFirst({
      where: { outputLotId: lotId },
      include: {
        outputLot: true,
        variant: { select: { id: true, sku: true, label: true } },
        lines: {
          include: {
            rawMaterial: { select: { id: true, name: true, variant: { select: { sku: true } } } },
            lotAllocations: { include: { lot: true } },
          },
        },
      },
    });
    if (!run || !run.outputLot) {
      throw new NotFoundException('That lot was not produced by any production run.');
    }

    const inputLots = run.lines.flatMap((line) =>
      line.lotAllocations.map((allocation) => ({
        lot: allocation.lot,
        quantityConsumed: allocation.quantityBase,
        rawMaterial: line.rawMaterial,
      })),
    );

    return {
      outputLot: run.outputLot,
      producedByRun: {
        id: run.id,
        number: run.number,
        recipeId: run.recipeId,
        variantId: run.variantId,
        sku: run.variant.sku,
        quantityProduced: run.quantityProduced,
        producedAt: run.producedAt,
      },
      inputLots,
    };
  }

  /**
   * The reverse walk — "which finished batches did this ingredient reach,"
   * symmetrical to traceOutputLot(): the identical BomProductionLineLot
   * join, grouped by run instead of by output lot, in case one run drew
   * the same input lot across more than one line.
   */
  async traceInputLotForward(lotId: string) {
    const lot = await this.prisma.lot.findUnique({ where: { id: lotId } });
    if (!lot) throw new NotFoundException('That lot no longer exists.');

    const allocations = await this.prisma.bomProductionLineLot.findMany({
      where: { lotId },
      include: {
        productionLine: {
          include: {
            run: {
              include: {
                variant: { select: { id: true, sku: true, label: true } },
                outputLot: { select: { id: true, lotCode: true } },
              },
            },
          },
        },
      },
    });

    const byRun = new Map<string, { run: (typeof allocations)[number]['productionLine']['run']; quantityConsumed: number }>();
    for (const allocation of allocations) {
      const run = allocation.productionLine.run;
      const existing = byRun.get(run.id);
      if (existing) {
        existing.quantityConsumed += allocation.quantityBase;
      } else {
        byRun.set(run.id, { run, quantityConsumed: allocation.quantityBase });
      }
    }

    return [...byRun.values()].map(({ run, quantityConsumed }) => ({
      id: run.id,
      number: run.number,
      recipeId: run.recipeId,
      variantId: run.variantId,
      sku: run.variant.sku,
      quantityProduced: run.quantityProduced,
      producedAt: run.producedAt,
      outputLotId: run.outputLotId,
      outputLotCode: run.outputLot?.lotCode ?? null,
      quantityConsumedFromThisLot: quantityConsumed,
    }));
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
      const consumeMovements = await this.inventory.moveMany(
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

      // 71-recipe-batch-traceability.md, DECISIONS.md ADR-068. Individual
      // create() calls, not createMany() — a line's own id is required to
      // attach BomProductionLineLot rows to, and createMany() never returns
      // created rows. Safe to correlate a raw material's own consumption
      // back to its line by rawMaterialId: BomRecipeComponent is
      // @@unique([recipeId, rawMaterialId]), so each appears at most once.
      for (const line of consumption) {
        const variantId = line.component.rawMaterial.variant.id;
        const productionLine = await tx.bomProductionLine.create({
          data: {
            runId: run.id,
            rawMaterialId: line.component.rawMaterialId,
            variantId,
            quantityBase: line.totalBaseQty,
            unitCost: line.unitCost,
            lineCost: line.lineCost,
          },
        });

        if (line.component.rawMaterial.variant.lotTracked) {
          const movement = consumeMovements.find((m) => m.variantId === variantId);
          if (!movement) throw new Error('Missing movement');
          const allocations = await this.lots.recordDeduction(
            { variantId, locationId, quantity: line.totalBaseQty, stockMovementId: movement.id },
            tx,
          );
          if (allocations.length > 0) {
            await tx.bomProductionLineLot.createMany({
              data: allocations.map((allocation) => ({
                productionLineId: productionLine.id,
                lotId: allocation.lotId,
                quantityBase: allocation.quantity,
              })),
            });
          }
        }
      }

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

      // 71-recipe-batch-traceability.md §1. A production run is the OTHER
      // legitimate origin of a new lot besides a purchase (doc 32's own
      // sourceReceiptId) — created at the moment of production, the
      // output batch code either given or auto-generated from the run's
      // own number.
      if (outputVariant.lotTracked) {
        const outputLot = await this.lots.recordReceipt(
          {
            variantId: recipe.variantId,
            locationId,
            lotCode: dto.outputLotCode?.trim() || number,
            quantity: quantityProduced,
          },
          tx,
        );
        await tx.bomProductionRun.update({ where: { id: run.id }, data: { outputLotId: outputLot.id } });
      }

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
      // 71-recipe-batch-traceability.md's own "click the number" promise —
      // never a dead-end lot-code text label.
      outputLotId: run.outputLotId,
      outputLotCode: run.outputLot?.lotCode ?? null,
      lines: run.lines.map((line) => ({
        id: line.id,
        rawMaterialId: line.rawMaterialId,
        name: line.rawMaterial.name,
        sku: line.rawMaterial.variant.sku,
        quantityBase: line.quantityBase,
        unitCost: line.unitCost,
        lineCost: line.lineCost,
        lotAllocations: line.lotAllocations.map((allocation) => ({
          lotId: allocation.lotId,
          lotCode: allocation.lot.lotCode,
          quantityBase: allocation.quantityBase,
        })),
      })),
    };
  }
}
