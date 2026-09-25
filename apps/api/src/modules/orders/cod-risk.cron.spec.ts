import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CodRiskCron } from './cod-risk.cron';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('CodRiskCron', () => {
  let cron: CodRiskCron;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      shipment: { findMany: jest.fn() },
      cityCodRiskStat: { upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CodRiskCron, { provide: PrismaService, useValue: prisma }],
    }).compile();

    cron = module.get(CodRiskCron);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  function shipmentOf(city: string, isRto: boolean, grandTotal: number, provider = 'cod') {
    return {
      isRto,
      order: {
        grandTotal,
        shippingAddress: { city },
        payments: [{ provider }],
      },
    };
  }

  it('aggregates COD shipments by city into a total, RTO count and average order value', async () => {
    prisma.shipment.findMany.mockResolvedValue([
      shipmentOf('Lahore', false, 500_00),
      shipmentOf('Lahore', true, 700_00),
      shipmentOf('Karachi', false, 1000_00),
    ]);

    await cron.computeCityCodRiskStats();

    expect(prisma.cityCodRiskStat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { city: 'Lahore' },
        create: expect.objectContaining({ city: 'Lahore', totalShipments: 2, rtoShipments: 1, avgOrderValue: 600_00 }),
      }),
    );
    expect(prisma.cityCodRiskStat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { city: 'Karachi' },
        create: expect.objectContaining({ city: 'Karachi', totalShipments: 1, rtoShipments: 0, avgOrderValue: 1000_00 }),
      }),
    );
  });

  it('excludes a prepaid (non-COD) order from every city\'s stats', async () => {
    prisma.shipment.findMany.mockResolvedValue([shipmentOf('Lahore', true, 500_00, 'jazzcash')]);

    await cron.computeCityCodRiskStats();

    expect(prisma.cityCodRiskStat.upsert).not.toHaveBeenCalled();
  });

  it('excludes a shipment with no city on its order', async () => {
    prisma.shipment.findMany.mockResolvedValue([
      { isRto: false, order: { grandTotal: 500_00, shippingAddress: {}, payments: [{ provider: 'cod' }] } },
    ]);

    await cron.computeCityCodRiskStats();

    expect(prisma.cityCodRiskStat.upsert).not.toHaveBeenCalled();
  });

  it('does nothing when there are no shipments in the lookback window', async () => {
    prisma.shipment.findMany.mockResolvedValue([]);

    await cron.computeCityCodRiskStats();

    expect(prisma.cityCodRiskStat.upsert).not.toHaveBeenCalled();
  });
});
