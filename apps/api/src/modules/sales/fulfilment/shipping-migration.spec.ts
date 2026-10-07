import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ShippingService, computeRateFee } from './shipping.service';

/**
 * WO-6.1's own acceptance test: "the new module must produce byte-identical
 * fees for the existing zones on day one." Asserts ShippingService.quote()
 * against the migration's own backfill (20260924220000_add_fulfilment_
 * shipping_returns/migration.sql), which seeded exactly the three zones
 * settings.defaults.ts used to ship as a JSON Setting.
 */
describe('ShippingService — migrated zones produce the old fees', () => {
  let service: ShippingService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [ShippingService, PrismaService],
    }).compile();

    service = module.get(ShippingService);
    prisma = module.get(PrismaService);
  });

  it('karachi: Rs 150 flat, free above Rs 3,000 — exactly the old Setting default', async () => {
    const below = await service.quote('Karachi', 100_000);
    expect(below.fee).toBe(15_000);
    expect(below.zoneKey).toBe('karachi');

    const above = await service.quote('karachi', 500_000);
    expect(above.fee).toBe(0);
  });

  it('punjab: matches on any of its six cities, Rs 200 flat, free above Rs 4,000', async () => {
    for (const city of ['Lahore', 'islamabad', 'Rawalpindi', 'faisalabad', 'Multan', 'GUJRANWALA']) {
      const quote = await service.quote(city, 100_000);
      expect(quote.zoneKey).toBe('punjab');
      expect(quote.fee).toBe(20_000);
    }

    const above = await service.quote('lahore', 450_000);
    expect(above.fee).toBe(0);
  });

  it('an unlisted city falls back to the catch-all rest_of_pakistan zone, Rs 250 flat, free above Rs 5,000', async () => {
    const quote = await service.quote('Gwadar', 100_000);
    expect(quote.zoneKey).toBe('rest_of_pakistan');
    expect(quote.fee).toBe(25_000);

    const above = await service.quote('Gwadar', 600_000);
    expect(above.fee).toBe(0);
  });

  it('resolveZone matches case-insensitively, same as the old resolveShippingZone()', async () => {
    const zone = await service.resolveZone('KARACHI');
    expect(zone.key).toBe('karachi');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});

describe('computeRateFee — pure logic', () => {
  it('FLAT: fee below the free-above threshold', () => {
    expect(computeRateFee({ type: 'FLAT', fee: 15_000, baseFee: 0, includedUnits: 0, freeAbove: 300_000 }, 100_000, 0, 1)).toBe(15_000);
  });

  it('FLAT: zero at or above the free-above threshold', () => {
    expect(computeRateFee({ type: 'FLAT', fee: 15_000, baseFee: 0, includedUnits: 0, freeAbove: 300_000 }, 300_000, 0, 1)).toBe(0);
  });

  it('FLAT: never free when freeAbove is null', () => {
    expect(computeRateFee({ type: 'FLAT', fee: 15_000, baseFee: 0, includedUnits: 0, freeAbove: null }, 10_000_000, 0, 1)).toBe(15_000);
  });

  it('BY_WEIGHT: base fee plus per-kg above includedUnits, rounded up', () => {
    const rate = { type: 'BY_WEIGHT' as const, fee: 2_000, baseFee: 10_000, includedUnits: 1_000, freeAbove: null };
    expect(computeRateFee(rate, 0, 1_000, 1)).toBe(10_000); // exactly the included weight
    expect(computeRateFee(rate, 0, 1_500, 1)).toBe(12_000); // 0.5kg over -> rounds up to 1 extra kg
    expect(computeRateFee(rate, 0, 3_000, 1)).toBe(14_000); // 2kg over
  });

  it('BY_ITEM: base fee plus per-item above includedUnits', () => {
    const rate = { type: 'BY_ITEM' as const, fee: 500, baseFee: 5_000, includedUnits: 2, freeAbove: null };
    expect(computeRateFee(rate, 0, 0, 2)).toBe(5_000);
    expect(computeRateFee(rate, 0, 0, 5)).toBe(6_500);
  });
});
