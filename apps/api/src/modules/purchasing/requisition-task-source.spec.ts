import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TaskSourceRegistry } from '../../core/extension-points/task-source.registry';
import { DomainEvent } from '../../core/events/domain-events';
import { RequisitionTaskSource } from './requisition-task-source';

/**
 * WO-23.3's own real, single demonstration registration. Reads
 * Posting/Position by a direct Prisma query — never a TypeScript import of
 * `hr` (module independence, CLAUDE.md).
 */
describe('RequisitionTaskSource', () => {
  let source: RequisitionTaskSource;
  let prisma: any;
  let registry: any;

  const payload = { requisitionId: 'req1', requestedById: 'u1', locationId: 'loc1' };

  beforeEach(async () => {
    prisma = { posting: { findFirst: jest.fn() } };
    registry = { register: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RequisitionTaskSource, { provide: PrismaService, useValue: prisma }, { provide: TaskSourceRegistry, useValue: registry }],
    }).compile();

    source = module.get(RequisitionTaskSource);
  });

  it('registers against RequisitionCreated on module init', () => {
    source.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(expect.objectContaining({ eventName: DomainEvent.RequisitionCreated }));
  });

  it('skips (returns null) when the requester holds no open primary posting — the absent-collaborator case', async () => {
    prisma.posting.findFirst.mockResolvedValue(null);
    source.onModuleInit();
    const mapping = registry.register.mock.calls[0][0];
    expect(await mapping.toTask(payload)).toBeNull();
  });

  it("skips when the requester's own post reports to nobody", async () => {
    prisma.posting.findFirst.mockResolvedValue({ position: { id: 'pos1', reportsToId: null } });
    source.onModuleInit();
    const mapping = registry.register.mock.calls[0][0];
    expect(await mapping.toTask(payload)).toBeNull();
  });

  it("resolves a task at the requester's own manager's post, idempotency keyed to the requisition", async () => {
    prisma.posting.findFirst.mockResolvedValue({ position: { id: 'pos1', reportsToId: 'manager-pos' } });
    source.onModuleInit();
    const mapping = registry.register.mock.calls[0][0];
    const result = await mapping.toTask(payload);
    expect(result).toEqual(
      expect.objectContaining({ positionId: 'manager-pos', sourceType: 'purchasing', sourceId: 'req1', sourceRef: 'req1' }),
    );
  });
});
