import { Test, TestingModule } from '@nestjs/testing';
import { CodRiskService } from './cod-risk.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';

describe('CodRiskService', () => {
  let service: CodRiskService;
  let prisma: any;
  let settings: any;

  const baseInput = {
    address: { line1: 'House 12, Street 5, Sector G-9', line2: 'Near City Park', postalCode: '44000', phone: '03001234567', city: 'Lahore' },
    orderValue: 500_00,
    userId: 'user1',
    placedAt: new Date('2026-06-15T10:00:00.000Z'), // daytime everywhere relevant
  };

  beforeEach(async () => {
    prisma = {
      contact: { findUnique: jest.fn().mockResolvedValue(null) },
      cityCodRiskStat: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    settings = {
      get: jest.fn().mockImplementation(async (key: string) => {
        if (key === SettingKey.StoreTimezone) return 'Asia/Karachi';
        if (key === SettingKey.CodRiskMinCityOrders) return 10;
        if (key === SettingKey.CodRiskConfirmationCallThreshold) return 35;
        if (key === SettingKey.CodRiskAdvancePaymentThreshold) return 65;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodRiskService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(CodRiskService);
  });

  it('scores a clean order as AUTO_CONFIRM with no history and no city data', async () => {
    const result = await service.score(baseInput);

    expect(result).not.toBeNull();
    expect(result!.action).toBe('AUTO_CONFIRM');
  });

  it('looks the customer up by phone, not by Order.contactId — the CRM link is not set yet at place()', async () => {
    prisma.contact.findUnique.mockResolvedValue({ orderCount: 5, rtoCount: 4 });

    const result = await service.score(baseInput);

    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where: { phoneE164: '+923001234567' },
      select: { orderCount: true, rtoCount: true },
    });
    expect(result!.reasonEn).toContain('returned 4 of its last 5 orders');
  });

  it('ignores a city\'s stats below the minimum sample size', async () => {
    prisma.cityCodRiskStat.findUnique.mockResolvedValue({ city: 'Lahore', totalShipments: 3, rtoShipments: 3, avgOrderValue: 100_00 });

    const result = await service.score(baseInput);

    // 3 shipments < the minimum of 10 -> no city signal at all, so a 100%
    // city RTO rate contributes nothing.
    expect(result!.action).toBe('AUTO_CONFIRM');
  });

  it('trusts a city\'s stats once the sample size clears the minimum', async () => {
    prisma.cityCodRiskStat.findUnique.mockResolvedValue({ city: 'Lahore', totalShipments: 20, rtoShipments: 8, avgOrderValue: 500_00 });

    const result = await service.score(baseInput);

    expect(result!.reasonEn).toContain("city's COD return rate");
  });

  it('resolves the local hour from the shop timezone setting, not the server clock', async () => {
    prisma.contact.findUnique.mockResolvedValue({ orderCount: 1, rtoCount: 0 }); // neutral, isolates the time-of-day signal
    // 2026-06-15 20:30 UTC is 2026-06-16 01:30 in Karachi (UTC+5) — late night there.
    const result = await service.score({ ...baseInput, placedAt: new Date('2026-06-15T20:30:00.000Z') });

    expect(result!.reasonEn).toContain('night');
  });

  it('never throws and returns null when a dependency fails', async () => {
    prisma.contact.findUnique.mockRejectedValue(new Error('db hiccup'));

    const result = await service.score(baseInput);

    expect(result).toBeNull();
  });

  it('treats a guest checkout (no userId) as a small risk signal', async () => {
    prisma.contact.findUnique.mockResolvedValue({ orderCount: 1, rtoCount: 0 }); // neutral, isolates the guest-checkout signal
    const result = await service.score({ ...baseInput, userId: null });

    expect(result!.reasonEn).toContain('Guest checkout');
  });
});
