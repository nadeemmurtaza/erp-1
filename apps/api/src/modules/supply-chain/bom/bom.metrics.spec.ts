import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { AuditService } from '../../../core/audit/audit.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { LotsService } from '../inventory/lots.service';
import { StockIntakeRegistry } from '../../../core/extension-points/stock-intake.registry';
import { IntentRouterService } from '../../../core/intent/intent-router.service';
import { EntityEnrichmentRegistry } from '../../../core/extension-points/entity-enrichment.registry';
import { BomService } from './bom.service';
import { RawMaterialService } from './raw-material.service';
import { RecipeService } from './recipe.service';
import { RecipeQueryDto } from './dto/recipe.dto';
import { ProductionService } from './production.service';
import { BomMetricsService } from './bom.metrics';

/**
 * WO-23.2's WO-C.4 (10-admin-dashboard.md §C). ADR-019's precedent applies
 * again: shipped as a plain endpoint against the live idiom, not the doc's
 * assumed (and never-built) Track A card/report registry — see
 * DECISIONS.md's ADR-019 and its reuse for WO-B.5.
 */
describe('BomMetricsService — raw usage', () => {
  let rawMaterials: RawMaterialService;
  let recipes: RecipeService;
  let production: ProductionService;
  let metrics: BomMetricsService;
  let inventory: InventoryService;
  let prisma: PrismaService;
  let actorId: string;
  let locationId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RawMaterialService,
        BomService,
        RecipeService,
        ProductionService,
        BomMetricsService,
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        AuditService,
        InventoryService,
        LotsService,
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: StockIntakeRegistry, useValue: { register: jest.fn() } },
        { provide: IntentRouterService, useValue: { register: jest.fn() } },
        { provide: EntityEnrichmentRegistry, useValue: { register: jest.fn() } },
      ],
    }).compile();

    rawMaterials = module.get(RawMaterialService);
    recipes = module.get(RecipeService);
    production = module.get(ProductionService);
    metrics = module.get(BomMetricsService);
    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);

    actorId = (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })).id;
    locationId = await inventory.defaultLocationId();
  });

  afterEach(async () => {
    const products = await prisma.product.findMany({
      where: { translations: { some: { name: { startsWith: 'bom.metrics.spec ' } } } },
      select: { id: true, variants: { select: { id: true } } },
    });
    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));

    if (variantIds.length > 0) {
      const runs = await prisma.bomProductionRun.findMany({
        where: { variantId: { in: variantIds } },
        select: { id: true },
      });
      if (runs.length > 0) {
        const runIds = runs.map((r) => r.id);
        await prisma.bomProductionLine.deleteMany({ where: { runId: { in: runIds } } });
        await prisma.bomProductionRun.deleteMany({ where: { id: { in: runIds } } });
      }
      await prisma.bomComponent.deleteMany({ where: { recipe: { variantId: { in: variantIds } } } });
      await prisma.bomRecipe.deleteMany({ where: { variantId: { in: variantIds } } });
      await prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } });
    }
  });

  function name(label: string): string {
    return `bom.metrics.spec ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function createFinishedVariant(label: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const product = await prisma.product.create({
      data: {
        slug: `bom-metrics-spec-${suffix}`,
        kind: 'STITCHED',
        status: 'DRAFT',
        basePrice: 0,
        translations: { create: [{ locale: 'en', name: name(label) }] },
        variants: { create: [{ sku: `BOM-METRICS-${suffix.toUpperCase()}`, stock: 0 }] },
      },
      include: { variants: true },
    });
    return product.variants[0];
  }

  async function makeActiveRecipeWithFabric(opts: { fabricStock: number; fabricCostPrice: number; quantityBasePerBatch: number }) {
    const material = await rawMaterials.create({ name: name('Fabric'), unit: 'GAZ', unitScale: 1000 });
    await prisma.productVariant.update({ where: { id: material.variantId }, data: { costPrice: opts.fabricCostPrice } });
    await inventory.move({ variantId: material.variantId, locationId, delta: opts.fabricStock, reason: 'ADJUSTMENT', actorId });

    const finished = await createFinishedVariant('Output');
    const draft = await recipes.create(
      {
        variantId: finished.id,
        components: [{ rawMaterialId: material.id, quantityBase: opts.quantityBasePerBatch, isOptional: false }],
      },
      actorId,
    );
    const recipe = await recipes.activate(draft.id);
    return { material, finished, recipe };
  }

  it('with no runs ever recorded, raw usage returns an empty series and empty totals', async () => {
    const result = await metrics.rawUsage({ days: 30 });
    // Scoped assertion: no bom.metrics.spec material appears, since none was created.
    expect(result.totals.every((row) => !row.name.startsWith('bom.metrics.spec'))).toBe(true);
  });

  it('raw-usage totals equal the sum of BomProductionLine.quantityBase over the same window — two independent paths, same number', async () => {
    const { material, recipe } = await makeActiveRecipeWithFabric({
      fabricStock: 50000,
      fabricCostPrice: 30,
      quantityBasePerBatch: 2000,
    });

    await production.create({ recipeId: recipe.id, runs: 3 }, actorId);
    // A second run, so "runs" count and totals both accumulate across more than one.
    await inventory.move({ variantId: material.variantId, locationId, delta: 10000, reason: 'ADJUSTMENT', actorId });
    await production.create({ recipeId: recipe.id, runs: 2 }, actorId);

    const lines = await prisma.bomProductionLine.findMany({ where: { rawMaterialId: material.id } });
    const expectedConsumedBase = lines.reduce((sum, line) => sum + line.quantityBase, 0);

    const result = await metrics.rawUsage({ days: 30 });
    const row = result.totals.find((t) => t.rawMaterialId === material.id);

    expect(row).toBeDefined();
    expect(row!.consumedBase).toBe(expectedConsumedBase);
    expect(row!.runs).toBe(2);
  });

  it('cost fields are computed correctly (stripped by the controller, not this service)', async () => {
    const { material, recipe } = await makeActiveRecipeWithFabric({
      fabricStock: 10000,
      fabricCostPrice: 25,
      quantityBasePerBatch: 1000,
    });

    await production.create({ recipeId: recipe.id, runs: 1 }, actorId);

    const result = await metrics.rawUsage({ days: 30 });
    const row = result.totals.find((t) => t.rawMaterialId === material.id);

    expect(row!.consumedCost).toBe(1000 * 25);
  });

  it('the series buckets consumption by day within the window', async () => {
    const { material, recipe } = await makeActiveRecipeWithFabric({
      fabricStock: 10000,
      fabricCostPrice: 10,
      quantityBasePerBatch: 1000,
    });

    await production.create({ recipeId: recipe.id, runs: 1 }, actorId);

    const result = await metrics.rawUsage({ days: 30, bucket: 'day' });
    const today = new Date().toISOString().slice(0, 10);
    const point = result.series.find((p) => p.t === today);

    expect(point).toBeDefined();
    expect(point!.byMaterial[material.id]).toBe(1000);
  });

  describe('missing-recipe count consistency', () => {
    it('missingSummary().counts.missing equals the row count list(filter=missing) returns', async () => {
      await createFinishedVariant('Missing Candidate');
      const finished = (
        await prisma.product.findFirst({
          where: { translations: { some: { name: { contains: 'Missing Candidate' } } } },
          include: { variants: true },
        })
      )!;
      await prisma.product.update({ where: { id: finished.id }, data: { status: 'ACTIVE' } });

      const summary = await recipes.missingSummary();
      const listed = await recipes.list(Object.assign(new RecipeQueryDto(), { filter: 'missing' as const, pageSize: 9999 }));

      expect(summary.counts.missing).toBe(listed.meta.total);
    });
  });
});
