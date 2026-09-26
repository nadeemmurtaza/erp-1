import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { TaskStageService } from './task-stage.service';

describe('TaskStageService — WO-23.1: stages seeded empty, added by a client without a migration', () => {
  let service: TaskStageService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      taskStageDefinition: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskStageService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(TaskStageService);
  });

  it('refuses a duplicate key', async () => {
    prisma.taskStageDefinition.findUnique.mockResolvedValue({ id: 's1' });
    await expect(service.create({ key: 'cutting', label: 'Cutting' }, 'admin1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('assigns the next order automatically, ten apart, and audits the create', async () => {
    prisma.taskStageDefinition.findUnique.mockResolvedValue(null);
    prisma.taskStageDefinition.aggregate.mockResolvedValue({ _max: { order: 10 } });
    prisma.taskStageDefinition.create.mockResolvedValue({ id: 's2', key: 'stitching', label: 'Stitching', order: 20 });

    const row = await service.create({ key: 'stitching', label: 'Stitching' }, 'admin1');

    expect(row.order).toBe(20);
    expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'task_stage.created' }));
  });

  it('reordering does not touch label/key — only the order column', async () => {
    prisma.taskStageDefinition.update.mockResolvedValue({ id: 's1', key: 'cutting', label: 'Cutting', order: 5 });
    await service.reorder('s1', 5, 'admin1');
    expect(prisma.taskStageDefinition.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { order: 5 } });
  });

  it('lists stages ordered by their own order column', async () => {
    prisma.taskStageDefinition.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.taskStageDefinition.findMany).toHaveBeenCalledWith({ orderBy: { order: 'asc' } });
  });
});
