import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../core/audit/audit.service';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AudienceService } from './audience.service';
import { BulletinsService } from './bulletins.service';

/**
 * tasks-notifications-support/61-policy-communications-bulletin.md
 * (WO-61.2) — covers the doc's own Acceptance criteria: reach-bounded
 * publish authority, one event per publish, an idempotent acknowledge,
 * and a retraction that archives rather than deletes.
 */
describe('BulletinsService', () => {
  let service: BulletinsService;
  let prisma: any;
  let eventBus: any;
  let audit: any;
  let reachOf: jest.Mock;

  beforeEach(async () => {
    reachOf = jest.fn().mockResolvedValue(null); // unrestricted by default

    prisma = {
      bulletin: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      bulletinAcknowledgement: { create: jest.fn() },
      posting: { findMany: jest.fn() },
      orgUnit: { findMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    eventBus = { publish: jest.fn() };
    audit = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulletinsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AudienceService, useValue: { reachOf, resolve: jest.fn() } },
        { provide: EventBusService, useValue: eventBus },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(BulletinsService);
  });

  describe('publish', () => {
    it('an unrestricted author (no posting) may address the whole organization', async () => {
      prisma.bulletin.create.mockResolvedValue({ id: 'b1', audienceOrgUnitId: null });

      await service.publish({ authorId: 'admin1', title: 'T', bodyMarkdown: 'B', category: 'NOTICE', audienceOrgUnitId: null });

      expect(prisma.bulletin.create).toHaveBeenCalledTimes(1);
    });

    it('refuses a reach-bound author addressing the whole organization', async () => {
      reachOf.mockResolvedValue(['north']);

      await expect(
        service.publish({ authorId: 'mgr1', title: 'T', bodyMarkdown: 'B', category: 'NOTICE', audienceOrgUnitId: null }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.bulletin.create).not.toHaveBeenCalled();
    });

    it('refuses a reach-bound author addressing a unit outside their own reach', async () => {
      reachOf.mockResolvedValue(['north']);

      await expect(
        service.publish({ authorId: 'mgr1', title: 'T', bodyMarkdown: 'B', category: 'NOTICE', audienceOrgUnitId: 'south' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a reach-bound author addressing their own unit, and fires exactly one event', async () => {
      reachOf.mockResolvedValue(['north']);
      prisma.bulletin.create.mockResolvedValue({ id: 'b1', audienceOrgUnitId: 'north' });

      await service.publish({ authorId: 'mgr1', title: 'T', bodyMarkdown: 'B', category: 'NOTICE', audienceOrgUnitId: 'north' });

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(eventBus.publish).toHaveBeenCalledWith(
        DomainEvent.BulletinPublished,
        { bulletinId: 'b1', audienceOrgUnitId: 'north' },
        prisma,
      );
    });
  });

  describe('list', () => {
    it('an unrestricted reader (no posting) sees every active notice', async () => {
      prisma.posting.findMany.mockResolvedValue([]);
      prisma.bulletin.findMany.mockResolvedValue([{ id: 'b1' }]);

      const result = await service.list('admin1');

      expect(result).toEqual([{ id: 'b1' }]);
      const where = prisma.bulletin.findMany.mock.calls[0][0].where;
      expect(where.AND[1]).toEqual({});
    });

    it('a reach-bound reader is scoped to units their posting path includes', async () => {
      prisma.posting.findMany.mockResolvedValue([{ position: { orgUnitId: 'store5' } }]);
      prisma.orgUnit.findMany.mockResolvedValue([{ path: ['root', 'north', 'store5'] }]);
      prisma.bulletin.findMany.mockResolvedValue([]);

      await service.list('staff1');

      const where = prisma.bulletin.findMany.mock.calls[0][0].where;
      expect(where.AND[1]).toEqual({ OR: [{ audienceOrgUnitId: null }, { audienceOrgUnitId: { in: ['root', 'north', 'store5'] } }] });
    });
  });

  describe('get', () => {
    it('404s rather than 403s for a bulletin outside the caller\'s audience', async () => {
      prisma.bulletin.findUnique.mockResolvedValue({ id: 'b1', audienceOrgUnitId: 'south' });
      prisma.posting.findMany.mockResolvedValue([{ position: { orgUnitId: 'store5' } }]);
      prisma.orgUnit.findMany.mockResolvedValue([{ path: ['root', 'north', 'store5'] }]);

      await expect(service.get('b1', 'staff1')).rejects.toThrow(NotFoundException);
    });

    it('returns a bulletin addressed to an ancestor of the caller\'s own unit', async () => {
      const bulletin = { id: 'b1', audienceOrgUnitId: 'north' };
      prisma.bulletin.findUnique.mockResolvedValue(bulletin);
      prisma.posting.findMany.mockResolvedValue([{ position: { orgUnitId: 'store5' } }]);
      prisma.orgUnit.findMany.mockResolvedValue([{ path: ['root', 'north', 'store5'] }]);

      await expect(service.get('b1', 'staff1')).resolves.toEqual(bulletin);
    });
  });

  describe('acknowledge', () => {
    it('a double-click produces exactly one row — the second is a swallowed P2002', async () => {
      prisma.bulletin.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bulletinAcknowledgement.create.mockResolvedValueOnce({ id: 'ack1' }).mockRejectedValueOnce({ code: 'P2002' });

      await service.acknowledge('b1', 'u1');
      await expect(service.acknowledge('b1', 'u1')).resolves.toBeUndefined();

      expect(prisma.bulletinAcknowledgement.create).toHaveBeenCalledTimes(2);
    });

    it('a non-unique-violation error still propagates', async () => {
      prisma.bulletin.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.bulletinAcknowledgement.create.mockRejectedValue(new Error('down'));

      await expect(service.acknowledge('b1', 'u1')).rejects.toThrow('down');
    });
  });

  describe('retract', () => {
    it('archives rather than deletes, and is idempotent', async () => {
      prisma.bulletin.findUnique.mockResolvedValueOnce({ archivedAt: null });

      await service.retract('b1', 'admin1');

      expect(prisma.bulletin.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { archivedAt: expect.any(Date) } });

      prisma.bulletin.findUnique.mockResolvedValueOnce({ archivedAt: new Date() });
      await service.retract('b1', 'admin1');

      expect(prisma.bulletin.update).toHaveBeenCalledTimes(1); // second call no-ops
    });
  });
});
