import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PeopleService } from './people.service';

/**
 * hr-people-org/20-people-positions-ranks.md. No `Employee` model
 * (DECISIONS.md ADR-044) — every method here takes a `userId` directly.
 */
describe('PeopleService', () => {
  let service: PeopleService;
  let prisma: any;
  let audit: any;

  const posting = (over: Partial<any> = {}) => ({
    id: 'p1',
    userId: 'u1',
    positionId: 'pos1',
    isPrimary: true,
    startedOn: new Date('2026-01-01'),
    endedOn: null,
    position: { title: 'Finance Manager', orgUnitId: 'ou1', rank: { level: 30, label: 'Manager' } },
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      rank: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      position: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      posting: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      orgUnit: { findUnique: jest.fn() },
      user: { findMany: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PeopleService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(PeopleService);
  });

  describe('createRank', () => {
    it('refuses a duplicate key or level', async () => {
      prisma.rank.findFirst.mockResolvedValue({ id: 'r1' });
      await expect(service.createRank({ key: 'manager', label: 'Manager', level: 30 })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('createPosition', () => {
    it('refuses an unknown org unit', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(null);
      await expect(service.createPosition({ title: 'X', orgUnitId: 'bad', rankId: 'r1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unknown rank', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue({ id: 'ou1' });
      prisma.rank.findUnique.mockResolvedValue(null);
      await expect(service.createPosition({ title: 'X', orgUnitId: 'ou1', rankId: 'bad' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('primaryFor / postingsFor', () => {
    it('returns null when nobody holds a primary posting', async () => {
      prisma.posting.findFirst.mockResolvedValue(null);
      expect(await service.primaryFor('u1')).toBeNull();
    });

    it('maps a posting row to its view, including the rank/position projection', async () => {
      prisma.posting.findFirst.mockResolvedValue(posting());
      const result = await service.primaryFor('u1');
      expect(result).toEqual(
        expect.objectContaining({ positionTitle: 'Finance Manager', rankLevel: 30, rankLabel: 'Manager' }),
      );
    });
  });

  describe('ranksOf / outranks — the maximum rule, never first-found', () => {
    it('returns every open posting rank level, highest first', async () => {
      prisma.posting.findMany.mockResolvedValue([
        posting({ id: 'p1', position: { title: 'A', orgUnitId: 'ou1', rank: { level: 10, label: 'Junior' } } }),
        posting({ id: 'p2', position: { title: 'B', orgUnitId: 'ou2', rank: { level: 40, label: 'Director' } } }),
      ]);
      expect(await service.ranksOf('u1')).toEqual([40, 10]);
    });

    it('outranks() compares the MAXIMUM of each side, not the first element', () => {
      expect(service.outranks([10, 40], [30])).toBe(true);
      expect(service.outranks([10], [30])).toBe(false);
      expect(service.outranks([10], [10])).toBe(false);
    });

    it('outranks() treats nobody holding any posting as unrankable — always outranked', () => {
      expect(service.outranks([], [10])).toBe(false);
      expect(service.outranks([10], [])).toBe(true);
    });
  });

  describe('previewAssign / assign — refuses a second open primary rather than silently ending the first', () => {
    it('previewAssign reports no block for a non-primary posting', async () => {
      const result = await service.previewAssign('u1', 'pos2', false);
      expect(result.blockedBy).toBeNull();
    });

    it('previewAssign reports the blocking posting when a different primary is already open', async () => {
      prisma.posting.findFirst.mockResolvedValue(posting());
      const result = await service.previewAssign('u1', 'pos2', true);
      expect(result.blockedBy).toEqual({ postingId: 'p1', positionTitle: 'Finance Manager' });
    });

    it('assign() refuses a second open primary posting for the same user', async () => {
      prisma.position.findUnique.mockResolvedValue({ id: 'pos2' });
      prisma.posting.findFirst.mockResolvedValue(posting());
      await expect(service.assign({ userId: 'u1', positionId: 'pos2', isPrimary: true }, 'admin1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.posting.create).not.toHaveBeenCalled();
    });

    it('assign() allows a second NON-primary posting alongside an open primary (acting cover)', async () => {
      prisma.position.findUnique.mockResolvedValue({ id: 'pos2' });
      prisma.posting.findFirst.mockResolvedValue(posting()); // an open primary exists
      prisma.posting.create.mockResolvedValue(posting({ id: 'p2', positionId: 'pos2', isPrimary: false }));

      await service.assign({ userId: 'u1', positionId: 'pos2', isPrimary: false }, 'admin1');
      expect(prisma.posting.create).toHaveBeenCalled();
    });

    it('assign() succeeds and audits when there is no conflicting primary', async () => {
      prisma.position.findUnique.mockResolvedValue({ id: 'pos1' });
      prisma.posting.findFirst.mockResolvedValue(null);
      prisma.posting.create.mockResolvedValue(posting());

      await service.assign({ userId: 'u1', positionId: 'pos1', isPrimary: true }, 'admin1');
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'posting.assigned' }));
    });

    it('converts a database-level unique-constraint race into the identical friendly refusal', async () => {
      prisma.position.findUnique.mockResolvedValue({ id: 'pos2' });
      prisma.posting.findFirst.mockResolvedValue(null); // pre-check sees nothing...
      prisma.posting.create.mockRejectedValue({ code: 'P2002' }); // ...but the index catches the race.

      await expect(service.assign({ userId: 'u1', positionId: 'pos2', isPrimary: true }, 'admin1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('end', () => {
    it('throws NotFoundException for a missing posting', async () => {
      prisma.posting.findUnique.mockResolvedValue(null);
      await expect(service.end('missing', undefined, 'admin1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent — ending an already-ended posting does nothing', async () => {
      prisma.posting.findUnique.mockResolvedValue(posting({ endedOn: new Date('2026-02-01') }));
      await service.end('p1', undefined, 'admin1');
      expect(prisma.posting.update).not.toHaveBeenCalled();
    });

    it('ends an open posting and audits it', async () => {
      prisma.posting.findUnique.mockResolvedValue(posting());
      prisma.posting.update.mockResolvedValue(posting({ endedOn: new Date() }));
      await service.end('p1', undefined, 'admin1');
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'posting.ended' }));
    });
  });
});
