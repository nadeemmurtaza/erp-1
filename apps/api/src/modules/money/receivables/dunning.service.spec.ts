import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DunningService } from './dunning.service';

describe('DunningService — WO-145.4', () => {
  let service: DunningService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      dunningPolicy: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
      dunningEvent: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DunningService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(DunningService);
  });

  it('getSteps returns an empty array when no policy is configured', async () => {
    prisma.dunningPolicy.findFirst.mockResolvedValue(null);
    expect(await service.getSteps()).toEqual([]);
  });

  it('getSteps sorts steps ascending by daysOverdue regardless of stored order', async () => {
    prisma.dunningPolicy.findFirst.mockResolvedValue({
      stepsJson: [
        { daysOverdue: 30, templateKey: 'final-notice' },
        { daysOverdue: 7, templateKey: 'gentle-reminder' },
      ],
    });
    const steps = await service.getSteps();
    expect(steps.map((s) => s.daysOverdue)).toEqual([7, 30]);
  });

  it('setPolicy creates the singleton row when none exists', async () => {
    prisma.dunningPolicy.findFirst.mockResolvedValue(null);
    prisma.dunningPolicy.create.mockResolvedValue({ id: 'p1' });

    await service.setPolicy({ steps: [{ daysOverdue: 7, templateKey: 'gentle-reminder' }] });

    expect(prisma.dunningPolicy.create).toHaveBeenCalled();
    expect(prisma.dunningPolicy.update).not.toHaveBeenCalled();
  });

  it('setPolicy updates the existing singleton row rather than creating a second one', async () => {
    prisma.dunningPolicy.findFirst.mockResolvedValue({ id: 'p1', stepsJson: [] });
    prisma.dunningPolicy.update.mockResolvedValue({ id: 'p1' });

    await service.setPolicy({ steps: [{ daysOverdue: 7, templateKey: 'gentle-reminder' }] });

    expect(prisma.dunningPolicy.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1' } }));
    expect(prisma.dunningPolicy.create).not.toHaveBeenCalled();
  });

  it('listEvents requires an orderId', async () => {
    await expect(service.listEvents(undefined)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listEvents lists an order\'s own dunning steps in order', async () => {
    prisma.dunningEvent.findMany.mockResolvedValue([{ id: 'de1', stepIndex: 0 }]);
    const events = await service.listEvents('order1');
    expect(prisma.dunningEvent.findMany).toHaveBeenCalledWith({ where: { orderId: 'order1' }, orderBy: { stepIndex: 'asc' } });
    expect(events).toHaveLength(1);
  });
});
