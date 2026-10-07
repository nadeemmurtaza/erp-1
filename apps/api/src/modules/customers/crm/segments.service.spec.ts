import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SegmentsService } from './segments.service';

describe('SegmentsService', () => {
  let service: SegmentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [SegmentsService, PrismaService],
    }).compile();
    service = module.get(SegmentsService);
    prisma = module.get(PrismaService);
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `segment-test-${Date.now()}-${seq}`;
  }

  afterEach(async () => {
    await prisma.segment.deleteMany({ where: { name: { contains: 'segment-test' } } });
    await prisma.contact.deleteMany({ where: { name: { contains: 'segment-test' } } });
    await prisma.tag.deleteMany({ where: { name: { contains: 'segment-test' } } });
  });

  it('resolves "repeat buyers in Lahore" — the doc\'s own worked example', async () => {
    const marker = tag();
    const repeatInLahore = await prisma.contact.create({
      data: { name: `${marker}-a`, orderCount: 3, city: 'Lahore' },
    });
    await prisma.contact.create({ data: { name: `${marker}-b`, orderCount: 1, city: 'Lahore' } });
    await prisma.contact.create({ data: { name: `${marker}-c`, orderCount: 5, city: 'Karachi' } });

    const segment = await service.createSegment(
      {
        name: tag(),
        filter: { all: [{ field: 'orderCount', operator: 'gte', value: 2 }, { field: 'city', operator: 'eq', value: 'Lahore' }] },
      },
      null,
    );

    const members = await service.resolveMembers(segment.id);
    expect(members.map((m) => m.id)).toEqual([repeatInLahore.id]);
  });

  it('resolves a lastOrderDaysAgo condition against a real date, not a string', async () => {
    const marker = tag();
    // Scoped by a tag unique to this test, not just the date condition — the
    // shared test DB has plenty of other contacts with a recent lastOrderAt
    // an unscoped filter would also match (the same class of flake already
    // fixed once in campaigns.service.spec.ts).
    const recent = await prisma.contact.create({
      data: {
        name: `${marker}-recent`,
        orderCount: 1,
        lastOrderAt: new Date(),
        tags: { create: [{ tag: { connectOrCreate: { where: { name: marker }, create: { name: marker } } } }] },
      },
    });
    await prisma.contact.create({
      data: {
        name: `${marker}-stale`,
        orderCount: 1,
        lastOrderAt: new Date(Date.now() - 90 * 24 * 60 * 60_000),
        tags: { create: [{ tag: { connectOrCreate: { where: { name: marker }, create: { name: marker } } } }] },
      },
    });

    const segment = await service.createSegment(
      {
        name: tag(),
        filter: {
          all: [
            { field: 'tag', operator: 'eq', value: marker },
            { field: 'lastOrderDaysAgo', operator: 'lt', value: 30 },
          ],
        },
      },
      null,
    );
    const members = await service.resolveMembers(segment.id);
    expect(members.map((m) => m.id)).toEqual([recent.id]);
  });

  it('filters by RFM score', async () => {
    const marker = tag();
    const highValue = await prisma.contact.create({ data: { name: marker, orderCount: 1, rfmMonetaryScore: 5 } });
    await prisma.contact.create({ data: { name: `${marker}-low`, orderCount: 1, rfmMonetaryScore: 1 } });

    const count = await service.previewCount({ all: [{ field: 'rfmMonetaryScore', operator: 'gte', value: 4 }] });
    expect(count).toBeGreaterThanOrEqual(1);
    const members = await service.resolveMembers(
      (await service.createSegment({ name: tag(), filter: { all: [{ field: 'rfmMonetaryScore', operator: 'gte', value: 4 }] } }, null)).id,
    );
    expect(members.some((m) => m.id === highValue.id)).toBe(true);
  });

  it('rejects a malformed filter', async () => {
    await expect(service.createSegment({ name: tag(), filter: { bogus: true } }, null)).rejects.toThrow();
  });
});
