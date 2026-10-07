import { SettingsService } from '../../../core/settings/settings.service';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';
import { EventBusService } from '../../../core/events/event-bus.service';
import { AuditService } from '../../../core/audit/audit.service';
import { StockIntakeRegistry } from '../../../core/extension-points/stock-intake.registry';
import { IntentRouterService } from '../../../core/intent/intent-router.service';
import { EntityEnrichmentRegistry } from '../../../core/extension-points/entity-enrichment.registry';
import { AppConfigService } from '../../../core/config/app-config.service';

describe('StockCountService', () => {
  let service: StockCountService;
  let inventory: InventoryService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StockCountService,
        InventoryService,
        PrismaService,
        StockIntakeRegistry,
        EntityEnrichmentRegistry,
        IntentRouterService,
        { provide: EventBusService, useValue: { publish: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        // The count number's prefix is a Setting now; this test is about the
        // variance maths, so it takes the shipped default.
        { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(undefined) } },
        // Node-prefixing is document-number.ts's own concern (see its spec);
        // this test takes the STANDALONE shape, same as every deployment today.
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'main' } },
      ],
    }).compile();

    service = module.get(StockCountService);
    inventory = module.get(InventoryService);
    prisma = module.get(PrismaService);
  });

  it('mid-count sale applies variance to current stock, not expected stock', async () => {
    // 1. Setup variant with 10 stock
    const seeded = await prisma.productVariant.findFirst({ where: { isActive: true } });
    if (!seeded) throw new Error('No variants seeded');
    // Held separately: `variant` is re-read after the count posts, which would
    // otherwise widen the type back to nullable inside the closure below.
    const variantId = seeded.id;
    let variant = seeded;

    // Update stock to 10. B6 (17-inventory-locations.md): ProductVariant.stock
    // is a denormalized SUM over VariantLocationStock, so both must be set
    // together or the standing invariant (stock === sum of location rows)
    // breaks immediately, before the test even starts.
    const locationId = await inventory.defaultLocationId();
    await prisma.variantLocationStock.upsert({
      where: { variantId_locationId: { variantId: variant.id, locationId } },
      create: { variantId: variant.id, locationId, quantity: 10 },
      update: { quantity: 10 },
    });
    await prisma.productVariant.update({ where: { id: variant.id }, data: { stock: 10 } });

    const user = await prisma.user.findFirst();
    if (!user) throw new Error('No users seeded');
    
    // 2. Start count
    const count = await service.create({ note: 'Test' }, user.id);
    await service.start(count.id);
    
    // 3. Verify expected is 10
    const startedCount = await service.findOne(count.id);
    const line = startedCount.lines.find((l) => l.variantId === variantId);
    if (!line) throw new Error('expected a count line for the seeded variant');
    expect(line!.expected).toBe(10);
    
    // 4. Mid-count sale reduces stock to 8
    await inventory.move({ variantId: variant.id, locationId, delta: -2, reason: 'SALE' });
    
    // 5. Staff counts 10 on the shelf
    await service.updateLine(count.id, variant.id, 10);
    
    // 6. Complete count
    await service.complete(count.id, user.id);
    
    // 7. Verify final stock is 10
    variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(variant.stock).toBe(10);
    
    // 8. Verify the variance posted was +2
    const movements = await inventory.history(variant.id);
    const countMovement = movements.find(m => m.reason === 'COUNT' && m.refId === count.id);
    expect(countMovement).toBeDefined();
    expect(countMovement!.delta).toBe(2);
  });
});
