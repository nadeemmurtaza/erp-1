import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../../core/audit/audit.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OrgUnitService } from './org-unit.service';

/**
 * hr-people-org/19-org-structure-offices-departments.md. `move()` is the
 * only writer of `path`/`depth`/`parentId` — these tests exercise that
 * single-writer discipline directly, since it is the whole point of the
 * document.
 */
describe('OrgUnitService', () => {
  let service: OrgUnitService;
  let prisma: any;
  let audit: any;

  const row = (over: Partial<any> = {}) => ({
    id: 'u1',
    code: 'hq',
    name: 'HQ',
    typeId: 't1',
    type: { key: 'head_office', label: 'Head Office' },
    parentId: null,
    path: ['u1'],
    depth: 0,
    nodeId: null,
    retailBrandId: null,
    isActive: true,
    closedAt: null,
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      orgUnitType: { findMany: jest.fn(), findUnique: jest.fn() },
      orgUnit: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      position: { findFirst: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OrgUnitService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(OrgUnitService);
  });

  describe('create', () => {
    it('refuses an unknown type', async () => {
      prisma.orgUnitType.findUnique.mockResolvedValue(null);
      await expect(service.create({ code: 'x', name: 'X', typeId: 'bad' }, 'admin1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a root unit with path = [its own id]', async () => {
      prisma.orgUnitType.findUnique.mockResolvedValue({ id: 't1' });
      prisma.orgUnit.create.mockResolvedValue(row({ id: 'new1', path: [] }));
      prisma.orgUnit.update.mockResolvedValue(row({ id: 'new1', path: ['new1'] }));

      await service.create({ code: 'hq', name: 'HQ', typeId: 't1' }, 'admin1');

      expect(prisma.orgUnit.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'new1' }, data: { path: ['new1'] } }),
      );
    });

    it('refuses a closed parent', async () => {
      prisma.orgUnitType.findUnique.mockResolvedValue({ id: 't1' });
      prisma.orgUnit.findUnique.mockResolvedValue(row({ closedAt: new Date() }));
      await expect(service.create({ code: 'x', name: 'X', typeId: 't1', parentId: 'u1' }, 'admin1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('close', () => {
    it('refuses when open child units exist', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(row());
      prisma.orgUnit.findFirst.mockResolvedValue({ id: 'child1' });
      await expect(service.close('u1', 'admin1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses when the unit still holds positions', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(row());
      prisma.orgUnit.findFirst.mockResolvedValue(null);
      prisma.position.findFirst.mockResolvedValue({ id: 'pos1' });
      await expect(service.close('u1', 'admin1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('closes cleanly when no children or positions remain', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(row());
      prisma.orgUnit.findFirst.mockResolvedValue(null);
      prisma.position.findFirst.mockResolvedValue(null);
      prisma.orgUnit.update.mockResolvedValue(row({ closedAt: new Date(), isActive: false }));

      await service.close('u1', 'admin1');
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'org_unit.closed' }));
    });

    it('is idempotent — closing an already-closed unit does nothing', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(row({ closedAt: new Date('2020-01-01') }));
      await service.close('u1', 'admin1');
      expect(prisma.orgUnit.update).not.toHaveBeenCalled();
    });
  });

  describe('move / previewMove — the single-writer discipline', () => {
    it('refuses a unit becoming its own parent', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(row());
      await expect(service.previewMove('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a move that would make a unit its own ancestor', async () => {
      // u1 is root; d1 is a descendant of u1. Moving u1 under d1 is a cycle.
      const u1 = row({ id: 'u1', path: ['u1'] });
      const d1 = row({ id: 'd1', parentId: 'u1', path: ['u1', 'd1'] });
      prisma.orgUnit.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'u1' ? u1 : d1));

      await expect(service.previewMove('u1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses moving under a closed unit', async () => {
      const u1 = row({ id: 'u1' });
      const closedParent = row({ id: 'p1', path: ['p1'], closedAt: new Date() });
      prisma.orgUnit.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'u1' ? u1 : closedParent));

      await expect(service.previewMove('u1', 'p1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rewrites every descendant path when moving a subtree, and only move() ever writes path/depth', async () => {
      // Tree: root(r1) -> a(a1) -> b(b1). Moving a1 under a new parent x1.
      const r1 = row({ id: 'r1', path: ['r1'] });
      const a1 = row({ id: 'a1', parentId: 'r1', path: ['r1', 'a1'] });
      const x1 = row({ id: 'x1', path: ['x1'] });
      prisma.orgUnit.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'a1') return Promise.resolve(a1);
        if (where.id === 'x1') return Promise.resolve(x1);
        return Promise.resolve(r1);
      });
      prisma.orgUnit.findMany.mockResolvedValue([
        { id: 'a1', path: ['r1', 'a1'] },
        { id: 'b1', path: ['r1', 'a1', 'b1'] },
      ]);
      prisma.orgUnit.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve('parentId' in data ? row({ id: where.id, path: ['x1', 'a1'], depth: 1 }) : { id: where.id, ...data }),
      );

      await service.move('a1', 'x1', 'admin1');

      // a1's new path: [x1, a1]; b1's new path: [x1, a1, b1] — the suffix from a1 downward, re-based.
      expect(prisma.orgUnit.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { path: ['x1', 'a1'], depth: 1 } });
      expect(prisma.orgUnit.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { path: ['x1', 'a1', 'b1'], depth: 2 } });
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'org_unit.moved' }));
    });

    it('moving to root (newParentId null) re-bases paths to start at the moved unit itself', async () => {
      const r1 = row({ id: 'r1', path: ['r1'] });
      const a1 = row({ id: 'a1', parentId: 'r1', path: ['r1', 'a1'] });
      prisma.orgUnit.findUnique.mockImplementation(({ where }: any) => Promise.resolve(where.id === 'a1' ? a1 : r1));
      prisma.orgUnit.findMany.mockResolvedValue([{ id: 'a1', path: ['r1', 'a1'] }]);
      prisma.orgUnit.update.mockImplementation(({ where, data }: any) =>
        Promise.resolve('parentId' in data ? row({ id: where.id, path: ['a1'], depth: 0 }) : { id: where.id, ...data }),
      );

      await service.move('a1', null, 'admin1');

      expect(prisma.orgUnit.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { path: ['a1'], depth: 0 } });
    });
  });

  describe('get / findRow', () => {
    it('throws NotFoundException for a missing unit', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(null);
      await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
