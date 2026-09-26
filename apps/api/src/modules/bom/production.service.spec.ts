import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { BadRequestException, MethodNotAllowedException } from '@nestjs/common';
import { weightedAverageCost } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AuditService } from '../../core/audit/audit.service';
import { EventBusService } from '../../core/events/event-bus.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { InventoryService } from '../inventory/inventory.service';
import { StockIntakeRegistry } from '../../core/extension-points/stock-intake.registry';
import { IntentRouterService } from '../../core/intent/intent-router.service';
import { EntityEnrichmentRegistry } from '../../core/extension-points/entity-enrichment.registry';
import { OrderEconomicsService } from '../finance/order-economics.service';
import { BomService } from './bom.service';
import { RawMaterialService } from './raw-material.service';
import { RecipeService } from './recipe.service';
import { ProductionService } from './production.service';

/**
 * WO-23.2's WO-C.3 (10-admin-dashboard.md §C) — "the step that makes BOM
 * real". Real PrismaService against the seeded test database, real
 * InventoryService — the acceptance criteria explicitly call for verifying
 * concurrency and rollback "inside a real transaction, not a mock".
 */
describe('ProductionService', () => {
  let rawMaterials: RawMaterialService;
  let recipes: RecipeService;
  let production: ProductionService;
  let inventory: InventoryService;
  let orderEconomics: OrderEconomicsService;
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
        OrderEconomicsService,
        PrismaService,
        SettingsService,
        AuditService,
        InventoryService,
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
    inventory = module.get(InventoryService);
    orderEconomics = module.get(OrderEconomicsService);
    prisma = module.get(PrismaService);

    actorId = (await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } })).id;
    locationId = await inventory.defaultLocationId();
  });

  afterEach(async () => {
    const products = await prisma.product.findMany({
      where: { translations: { some: { name: { startsWith: 'production.spec ' } } } },
      select: { id: true, variants: { select: { id: true } } },
    });
    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));

    if (variantIds.length > 0) {
      // A run references its output variant (Restrict) and, via its lines,
      // each raw material (Restrict) — clear runs before recipes/products.
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

    await prisma.orderEconomics.deleteMany({ where: { order: { number: { startsWith: 'production.spec ' } } } });
    await prisma.orderItem.deleteMany({ where: { order: { number: { startsWith: 'production.spec ' } } } });
    await prisma.location.deleteMany({ where: { code: { startsWith: 'PSPEC-' } } });
    await prisma.order.deleteMany({ where: { number: { startsWith: 'production.spec ' } } });
  });

  function name(label: string): string {
    return `production.spec ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function createFinishedVariant(label: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const product = await prisma.product.create({
      data: {
        slug: `production-spec-${suffix}`,
        kind: 'STITCHED',
        status: 'DRAFT',
        basePrice: 0,
        translations: { create: [{ locale: 'en', name: name(label) }] },
        variants: { create: [{ sku: `PROD-SPEC-${suffix.toUpperCase()}`, stock: 0 }] },
      },
      include: { variants: true },
    });
    return product.variants[0];
  }

  /** An ACTIVE recipe with one non-optional fabric component, with real stock behind it. */
  async function makeActiveRecipeWithFabric(opts: {
    fabricStock: number;
    fabricCostPrice: number;
    quantityBasePerBatch: number;
    outputQuantity?: number;
    labourCost?: number;
    overheadCost?: number;
    wastageBps?: number;
  }) {
    const material = await rawMaterials.create({ name: name('Fabric'), unit: 'GAZ', unitScale: 1000 });
    await prisma.productVariant.update({ where: { id: material.variantId }, data: { costPrice: opts.fabricCostPrice } });
    await inventory.move({
      variantId: material.variantId,
      locationId,
      delta: opts.fabricStock,
      reason: 'ADJUSTMENT',
      actorId,
    });

    const finished = await createFinishedVariant('Output');
    const draft = await recipes.create(
      {
        variantId: finished.id,
        outputQuantity: opts.outputQuantity ?? 1,
        wastageBps: opts.wastageBps ?? 0,
        labourCost: opts.labourCost ?? 0,
        overheadCost: opts.overheadCost ?? 0,
        components: [{ rawMaterialId: material.id, quantityBase: opts.quantityBasePerBatch, isOptional: false }],
      },
      actorId,
    );
    const recipe = await recipes.activate(draft.id);

    return { material, finished, recipe };
  }

  describe('consuming raw stock and producing finished stock', () => {
    it('a run of 10 consuming 2000 base units each leaves fabric 20000 lower, finished stock 10 higher, one movement per component plus one for the output, all sharing refType/refId', async () => {
      const { material, finished, recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 30000,
        fabricCostPrice: 50,
        quantityBasePerBatch: 2000,
      });

      const run = await production.create({ recipeId: recipe.id, runs: 10 }, actorId);

      const fabricVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: material.variantId } });
      expect(fabricVariant.stock).toBe(30000 - 20000);

      const finishedVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: finished.id } });
      expect(finishedVariant.stock).toBe(10);

      const movements = await prisma.stockMovement.findMany({
        where: { refType: 'BomProductionRun', refId: run.id },
      });
      expect(movements).toHaveLength(2);
      expect(movements.some((m) => m.variantId === material.variantId && m.delta === -20000)).toBe(true);
      expect(movements.some((m) => m.variantId === finished.id && m.delta === 10)).toBe(true);
    });

    it('producedUnitCost is an integer and materialCost equals the sum of line.lineCost exactly', async () => {
      const { recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 100000,
        fabricCostPrice: 37, // deliberately not a round number
        quantityBasePerBatch: 777,
        labourCost: 13,
        overheadCost: 7,
      });

      const run = await production.create({ recipeId: recipe.id, runs: 3 }, actorId);
      const detail = await production.get(run.id);

      expect(Number.isInteger(detail.producedUnitCost)).toBe(true);
      expect(detail.materialCost).toBe(detail.lines.reduce((sum, line) => sum + line.lineCost, 0));
    });
  });

  describe('scopeLevel/originNodeId/locationId — WO-23.3a, RETAIL-ERP.md R13/R8, ADR-021', () => {
    it('defaults scopeLevel to BRAND, stamps originNodeId from AppConfigService.nodeId, and defaults locationId to the shop default Location', async () => {
      const { recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 10000,
        fabricCostPrice: 50,
        quantityBasePerBatch: 100,
      });

      const run = await production.create({ recipeId: recipe.id, runs: 1 }, actorId);
      const stored = await prisma.bomProductionRun.findUniqueOrThrow({ where: { id: run.id } });

      expect(stored.scopeLevel).toBe('BRAND');
      expect(stored.originNodeId).toBe('main');
      expect(stored.locationId).toBe(locationId);
    });

    it('respects an explicit locationId/scopeLevel override', async () => {
      const { recipe, material } = await makeActiveRecipeWithFabric({
        fabricStock: 10000,
        fabricCostPrice: 50,
        quantityBasePerBatch: 100,
      });
      const productionFloor = await prisma.location.create({
        data: {
          name: name('Production floor'),
          code: `PSPEC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'PRODUCTION',
        },
      });
      // The recipe's fabric was stocked at the default location — move it to
      // the production floor so the run has stock to consume there.
      await inventory.move({ variantId: material.variantId, locationId, delta: -10000, reason: 'ADJUSTMENT', actorId });
      await inventory.move({ variantId: material.variantId, locationId: productionFloor.id, delta: 10000, reason: 'ADJUSTMENT', actorId });

      const run = await production.create(
        { recipeId: recipe.id, runs: 1, locationId: productionFloor.id, scopeLevel: 'BRANCH' },
        actorId,
      );
      const stored = await prisma.bomProductionRun.findUniqueOrThrow({ where: { id: run.id } });

      expect(stored.locationId).toBe(productionFloor.id);
      expect(stored.scopeLevel).toBe('BRANCH');
    });
  });

  describe('nothing writes ProductVariant.stock except InventoryService.move()', () => {
    it('every productVariant.update under apps/api/src/modules/bom sets no `stock` field', () => {
      const bomDir = join(__dirname);
      const files = collectTsFiles(bomDir).filter((f) => !f.endsWith('.spec.ts'));

      for (const file of files) {
        const source = readFileSync(file, 'utf8');
        const calls = source.match(/productVariant\.update\(\{[\s\S]*?\}\s*\)/g) ?? [];
        for (const call of calls) {
          expect(call).not.toMatch(/\bstock\s*:/);
        }
      }
    });
  });

  describe('insufficient raw stock', () => {
    it('rolls the whole run back — no run row, no movements, no cost change', async () => {
      const { material, finished, recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 500,
        fabricCostPrice: 10,
        quantityBasePerBatch: 1000, // needs 1000, only 500 in stock
      });

      await expect(production.create({ recipeId: recipe.id, runs: 1 }, actorId)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      const runs = await prisma.bomProductionRun.findMany({ where: { recipeId: recipe.id } });
      expect(runs).toHaveLength(0);

      const fabricVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: material.variantId } });
      expect(fabricVariant.stock).toBe(500);

      const finishedVariant = await prisma.productVariant.findUniqueOrThrow({ where: { id: finished.id } });
      expect(finishedVariant.stock).toBe(0);
      expect(finishedVariant.costPrice).toBe(0);
    });
  });

  describe('concurrent production runs — Rule 10', () => {
    it('exactly one of two concurrent runs succeeds when stock covers only one', async () => {
      const { recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 1000,
        fabricCostPrice: 10,
        quantityBasePerBatch: 1000, // exactly enough for ONE run
      });

      const results = await Promise.allSettled([
        production.create({ recipeId: recipe.id, runs: 1 }, actorId),
        production.create({ recipeId: recipe.id, runs: 1 }, actorId),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException);

      const runs = await prisma.bomProductionRun.findMany({ where: { recipeId: recipe.id } });
      expect(runs).toHaveLength(1);
    });
  });

  describe('finished-good costing — the same weightedAverageCost() helper purchasing uses', () => {
    it('matches the shared helper exactly, assembling from 5 units @ 300 already in stock plus 10 produced', async () => {
      const { finished, recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 100000,
        fabricCostPrice: 20,
        quantityBasePerBatch: 1000,
      });

      // Simulate 5 units already on the shelf at 300 paisa each.
      await inventory.move({ variantId: finished.id, locationId, delta: 5, reason: 'ADJUSTMENT', actorId });
      await prisma.productVariant.update({ where: { id: finished.id }, data: { costPrice: 300 } });

      const run = await production.create({ recipeId: recipe.id, runs: 10 }, actorId);

      const expected = weightedAverageCost(5, 300, 10, run.producedUnitCost);
      const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: finished.id } });
      expect(variant.costPrice).toBe(expected);
    });
  });

  /**
   * "An order placed after the run snapshots the new costPrice into
   * OrderItem.unitCost, and analytics reflects it" (WO-C.3 acceptance).
   * orders.service.ts's own snapshot step (costMap sourced from
   * variant.costPrice at placement) is untouched by this work order and is
   * that file's own concern to test; what THIS feature owns is proving
   * variant.costPrice is correct after a run (above) and that a downstream
   * consumer reading it produces the right figure — exercised here against
   * the real OrderEconomicsService, not a re-derivation of its formula.
   */
  describe('downstream — the new cost reaches order economics', () => {
    it('OrderEconomics.cogs reflects the post-run costPrice for an order snapshotting it', async () => {
      const { finished, recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 50000,
        fabricCostPrice: 40,
        quantityBasePerBatch: 1000,
      });

      await production.create({ recipeId: recipe.id, runs: 5 }, actorId);
      const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: finished.id } });

      const order = await prisma.order.create({
        data: {
          number: name('ORDER'),
          status: 'DELIVERED',
          shippingAddress: {},
          itemsSubtotal: 10000,
          grandTotal: 10000,
          placedAt: new Date(),
          items: {
            create: [
              {
                variantId: finished.id,
                kind: 'STITCHED',
                nameEn: 'production.spec order item',
                unitPrice: 2000,
                unitCost: variant.costPrice,
                quantity: 5,
                lineTotal: 10000,
              },
            ],
          },
        },
      });

      await orderEconomics.computeForOrder(order.id, false);

      const economics = await prisma.orderEconomics.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(economics.cogs).toBe(variant.costPrice * 5);
    });
  });

  describe('history is immutable', () => {
    it('editing the recipe afterwards changes no historical run or line value', async () => {
      const { recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 50000,
        fabricCostPrice: 25,
        quantityBasePerBatch: 1000,
      });

      const run = await production.create({ recipeId: recipe.id, runs: 1 }, actorId);
      const before = await production.get(run.id);

      await recipes.update(recipe.id, { labourCost: 999999, overheadCost: 999999 });

      const after = await production.get(run.id);
      expect(after.producedUnitCost).toBe(before.producedUnitCost);
      expect(after.materialCost).toBe(before.materialCost);
      expect(after.labourCost).toBe(before.labourCost);
      expect(after.overheadCost).toBe(before.overheadCost);
    });
  });

  describe('production is genuinely repeatable', () => {
    it('POST twice creates two distinct runs with distinct numbers', async () => {
      const { material, recipe } = await makeActiveRecipeWithFabric({
        fabricStock: 4000,
        fabricCostPrice: 15,
        quantityBasePerBatch: 1000,
      });

      const first = await production.create({ recipeId: recipe.id, runs: 1 }, actorId);
      // Top up stock so the second run has enough to succeed too.
      await inventory.move({ variantId: material.variantId, locationId, delta: 1000, reason: 'ADJUSTMENT', actorId });
      const second = await production.create({ recipeId: recipe.id, runs: 1 }, actorId);

      expect(first.id).not.toBe(second.id);
      expect(first.number).not.toBe(second.number);
    });
  });

  describe('deletion', () => {
    it('is never supported — always 405', () => {
      expect(() => production.remove()).toThrow(MethodNotAllowedException);
    });
  });
});

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}
