import { Test } from '@nestjs/testing';
import { CartLineValidatorRegistry } from '../../core/extension-points/cart-line-validator.registry';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { AuditService } from '../../core/audit/audit.service';
import { PricingService } from '../pricing/pricing.service';
import { CartService } from './cart.service';

/** 127-policy-as-data-completeness-sweep.md — a guest cart's TTL reads from Setting, not a hardcoded constant. */
describe('CartService.getOrCreate — guest cart TTL', () => {
  let service: CartService;
  let prisma: PrismaService;
  let settings: SettingsService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CartService,
        PrismaService,
        SettingsService,
        // Settings' shared L2 is not under test here: Redis reads as not connected, so every read is Postgres's.
        { provide: RedisService, useValue: { isReady: () => false } },
        CartLineValidatorRegistry,
        AuditService,
        PricingService,
      ],
    }).compile();
    service = module.get(CartService);
    prisma = module.get(PrismaService);
    settings = module.get(SettingsService);
  });

  const createdCartIds: string[] = [];

  afterEach(async () => {
    if (createdCartIds.length > 0) {
      await prisma.cart.deleteMany({ where: { id: { in: createdCartIds.splice(0) } } });
    }
    await settings.set(SettingKey.CartGuestTtlDays, 30);
  });

  it('sets a new guest cart to expire CartGuestTtlDays out, defaulting to 30', async () => {
    const before = Date.now();
    const view = await service.getOrCreate(undefined, undefined);
    createdCartIds.push(view.id);

    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: view.id } });
    const daysOut = (cart.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(29.9);
    expect(daysOut).toBeLessThan(30.1);
  });

  it('honors a changed CartGuestTtlDays setting, proving the TTL is not hardcoded', async () => {
    await settings.set(SettingKey.CartGuestTtlDays, 7);

    const before = Date.now();
    const view = await service.getOrCreate(undefined, undefined);
    createdCartIds.push(view.id);

    const cart = await prisma.cart.findUniqueOrThrow({ where: { id: view.id } });
    const daysOut = (cart.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(6.9);
    expect(daysOut).toBeLessThan(7.1);
  });
});
