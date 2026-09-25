import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RfmScoringCron } from './rfm-scoring.cron';

describe('RfmScoringCron', () => {
  let cron: RfmScoringCron;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ providers: [RfmScoringCron, PrismaService] }).compile();
    cron = module.get(RfmScoringCron);
    prisma = module.get(PrismaService);
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `rfm-test-${Date.now()}-${seq}`;
  }

  afterEach(async () => {
    await prisma.contact.deleteMany({ where: { name: { contains: 'rfm-test' } } });
  });

  it('scores every contact with at least one order, leaves the rest untouched', async () => {
    const marker = tag();
    const withOrders = await prisma.contact.create({
      data: { name: marker, orderCount: 3, lifetimeValue: 500000, lastOrderAt: new Date() },
    });
    const noOrders = await prisma.contact.create({ data: { name: `${marker}-none`, orderCount: 0 } });

    await cron.run();

    const scored = await prisma.contact.findUnique({ where: { id: withOrders.id } });
    const untouched = await prisma.contact.findUnique({ where: { id: noOrders.id } });

    expect(scored?.rfmRecencyScore).not.toBeNull();
    expect(scored?.rfmFrequencyScore).toBeGreaterThanOrEqual(1);
    expect(scored?.rfmMonetaryScore).toBeGreaterThanOrEqual(1);
    expect(scored?.rfmComputedAt).not.toBeNull();
    expect(untouched?.rfmRecencyScore).toBeNull();
  });
});
