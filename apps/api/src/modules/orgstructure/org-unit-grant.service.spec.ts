import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../core/audit/audit.service';
import { PermissionsResolverService } from '../../core/auth/permissions.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { GrantService } from './org-unit-grant.service';

/**
 * access-control-identity/21-access-over-the-org-tree.md. Every refusal
 * named in the doc gets its own spec — "these are stated as a list because
 * they are implemented as a list" (the doc's own words).
 */
describe('GrantService', () => {
  let service: GrantService;
  let prisma: any;
  let audit: any;
  let permissions: any;
  let settings: any;

  const grant = (over: Partial<any> = {}) => ({
    id: 'g1',
    userId: 'u1',
    orgUnitId: 'north',
    permissionKeys: ['hr.people.view'],
    mode: 'READ',
    expiresAt: new Date('2027-01-01'),
    grantedByUserId: 'granter1',
    countersignedByUserId: null,
    reason: 'audit coverage',
    revokedAt: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  });

  const validInput = () => ({
    userId: 'u1',
    orgUnitId: 'north',
    permissionKeys: ['hr.people.view'] as any,
    mode: 'READ' as const,
    expiresAt: new Date('2026-12-01'),
    reason: 'audit coverage',
  });

  beforeEach(async () => {
    prisma = {
      posting: { findMany: jest.fn().mockResolvedValue([]) },
      orgUnit: { findUnique: jest.fn() },
      orgUnitGrant: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    };
    audit = { recordEvidence: jest.fn() };
    permissions = {
      resolveForUser: jest.fn().mockResolvedValue({ roles: [], permissions: ['org.access.grant', 'hr.people.view'] }),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };
    settings = { getOrgAccessMaxGrantDays: jest.fn().mockResolvedValue(90) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrantService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: PermissionsResolverService, useValue: permissions },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get(GrantService);
  });

  describe('reachOf', () => {
    it('is unrestricted for a user with no open posting', async () => {
      prisma.posting.findMany.mockResolvedValue([]);
      expect(await service.reachOf('granter1')).toEqual({ isUnrestricted: true, unitIds: [] });
    });

    it('reaches the union of every open posting’s own unit', async () => {
      prisma.posting.findMany.mockResolvedValue([
        { position: { orgUnitId: 'north' } },
        { position: { orgUnitId: 'south' } },
      ]);
      const reach = await service.reachOf('granter1');
      expect(reach.isUnrestricted).toBe(false);
      expect(reach.unitIds.sort()).toEqual(['north', 'south']);
    });
  });

  describe('previewIssue / issue — the five refusals', () => {
    it('refuses when the granter does not hold org.access.grant', async () => {
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: ['hr.people.view'] });

      const preview = await service.previewIssue(validInput(), 'granter1');
      expect(preview.refusals.map((r) => r.code)).toContain('NOT_A_GRANTOR');

      await expect(service.issue(validInput(), 'granter1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.orgUnitGrant.create).not.toHaveBeenCalled();
    });

    it('refuses when the target unit is outside the granter’s own reachable subtree', async () => {
      prisma.posting.findMany.mockResolvedValue([{ position: { orgUnitId: 'south' } }]);
      prisma.orgUnit.findUnique.mockResolvedValue({ path: ['root', 'north'] });

      const preview = await service.previewIssue(validInput(), 'granter1');
      expect(preview.refusals.map((r) => r.code)).toContain('OUT_OF_REACH');
    });

    it('allows a granter with no posting at all — unrestricted, not empty', async () => {
      prisma.posting.findMany.mockResolvedValue([]);
      prisma.orgUnit.findUnique.mockResolvedValue({ path: ['root', 'north'] });
      prisma.orgUnitGrant.create.mockResolvedValue(grant());

      const preview = await service.previewIssue(validInput(), 'granter1');
      expect(preview.refusals.map((r) => r.code)).not.toContain('OUT_OF_REACH');
    });

    it('allows a granter posted at an ancestor of the target unit', async () => {
      prisma.posting.findMany.mockResolvedValue([{ position: { orgUnitId: 'root' } }]);
      prisma.orgUnit.findUnique.mockResolvedValue({ path: ['root', 'north'] });

      const preview = await service.previewIssue(validInput(), 'granter1');
      expect(preview.refusals.map((r) => r.code)).not.toContain('OUT_OF_REACH');
    });

    it('refuses conferring a key the granter does not themselves hold', async () => {
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: ['org.access.grant'] });

      const preview = await service.previewIssue(validInput(), 'granter1');
      expect(preview.refusals.map((r) => r.code)).toContain('KEY_NOT_HELD');

      await expect(service.issue(validInput(), 'granter1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an expiresAt beyond MAX_GRANT_DAYS, read from settings — not a constant', async () => {
      settings.getOrgAccessMaxGrantDays.mockResolvedValue(7);
      const farInput = { ...validInput(), expiresAt: new Date('2030-01-01') };

      const preview = await service.previewIssue(farInput, 'granter1');
      expect(preview.refusals.map((r) => r.code)).toContain('EXPIRY_TOO_FAR');

      await expect(service.issue(farInput, 'granter1')).rejects.toBeInstanceOf(BadRequestException);
    });

    describe('ACTING mode', () => {
      it('refuses with no countersignedByUserId at all', async () => {
        const input = { ...validInput(), mode: 'ACTING' as const };
        const preview = await service.previewIssue(input, 'granter1');
        expect(preview.refusals.map((r) => r.code)).toContain('NEEDS_COUNTERSIGNATURE');
      });

      it('refuses when the countersigner does not outrank the recipient', async () => {
        prisma.posting.findMany.mockImplementation(({ where }: any) => {
          if (where.userId === 'granter1') return Promise.resolve([]); // unrestricted reach — isolates this refusal
          if (where.userId === 'u1') return Promise.resolve([{ position: { rank: { level: 30 } } }]);
          return Promise.resolve([{ position: { rank: { level: 10 } } }]);
        });
        const input = { ...validInput(), mode: 'ACTING' as const, countersignedByUserId: 'weaker' };

        const preview = await service.previewIssue(input, 'granter1');
        expect(preview.refusals.map((r) => r.code)).toContain('NEEDS_COUNTERSIGNATURE');
      });

      it('allows a countersigner who outranks the recipient', async () => {
        prisma.posting.findMany.mockImplementation(({ where }: any) => {
          if (where.userId === 'granter1') return Promise.resolve([]); // unrestricted reach — isolates this refusal
          if (where.userId === 'u1') return Promise.resolve([{ position: { rank: { level: 10 } } }]);
          return Promise.resolve([{ position: { rank: { level: 30 } } }]);
        });
        prisma.orgUnitGrant.create.mockResolvedValue(grant({ mode: 'ACTING', countersignedByUserId: 'stronger' }));
        const input = { ...validInput(), mode: 'ACTING' as const, countersignedByUserId: 'stronger' };

        const preview = await service.previewIssue(input, 'granter1');
        expect(preview.refusals).toEqual([]);
      });
    });

    it('succeeds and audits when nothing refuses it', async () => {
      prisma.orgUnitGrant.create.mockResolvedValue(grant());

      const result = await service.issue(validInput(), 'granter1');

      expect(result.id).toBe('g1');
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'org_unit_grant.issued', actorId: 'granter1' }),
      );
    });

    // 208-l1-l2-l3-caching-architecture.md §2 — a grant is a write that changes
    // what the grantee resolves; judging the granter is not a per-request read.
    it('drops the grantee\'s cached permission set once the grant is committed', async () => {
      prisma.orgUnitGrant.create.mockResolvedValue(grant());

      await service.issue(validInput(), 'granter1');

      expect(permissions.invalidate).toHaveBeenCalledWith('u1');
      expect(permissions.invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(
        prisma.$transaction.mock.invocationCallOrder[0],
      );
    });

    it('judges the granter on an uncached read — a grant outlives any cache window', async () => {
      await service.previewIssue(validInput(), 'granter1');

      expect(permissions.resolveForUser).toHaveBeenCalledWith('granter1');
    });

    it('drops nothing when the grant is refused — nothing was written', async () => {
      permissions.resolveForUser.mockResolvedValue({ roles: [], permissions: ['hr.people.view'] });

      await expect(service.issue(validInput(), 'granter1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(permissions.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException for a missing grant', async () => {
      prisma.orgUnitGrant.findUnique.mockResolvedValue(null);
      await expect(service.revoke('missing', 'granter1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent — revoking an already-revoked grant does nothing further', async () => {
      prisma.orgUnitGrant.findUnique.mockResolvedValue(grant({ revokedAt: new Date('2026-02-01') }));
      await service.revoke('g1', 'granter1');
      expect(prisma.orgUnitGrant.update).not.toHaveBeenCalled();
      expect(permissions.invalidate).not.toHaveBeenCalled();
    });

    it('revokes an active grant and audits it — needs no other refusal check', async () => {
      prisma.orgUnitGrant.findUnique.mockResolvedValue(grant());
      prisma.orgUnitGrant.update.mockResolvedValue(grant({ revokedAt: new Date() }));

      await service.revoke('g1', 'granter1');

      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'org_unit_grant.revoked' }),
      );
    });

    it('drops the holder\'s cached permission set once the revocation is committed (doc 208 §2)', async () => {
      prisma.orgUnitGrant.findUnique.mockResolvedValue(grant({ userId: 'holder9' }));
      prisma.orgUnitGrant.update.mockResolvedValue(grant({ userId: 'holder9', revokedAt: new Date() }));

      await service.revoke('g1', 'granter1');

      expect(permissions.invalidate).toHaveBeenCalledWith('holder9');
    });
  });

  describe('sweepExpired', () => {
    it('marks every expired, not-yet-revoked grant as revoked and reports the count', async () => {
      prisma.orgUnitGrant.updateMany.mockResolvedValue({ count: 3 });
      const count = await service.sweepExpired();
      expect(count).toBe(3);
      expect(prisma.orgUnitGrant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ revokedAt: null }) }),
      );
      // Already expired, so already absent from every resolved set — and a
      // cached set was only ever cached until the grant's expiresAt.
      expect(permissions.invalidate).not.toHaveBeenCalled();
    });
  });

  describe('accessOverUnit', () => {
    it('throws NotFoundException for a missing unit', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue(null);
      await expect(service.accessOverUnit('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('combines open postings and valid grants at the unit or any of its ancestors', async () => {
      prisma.orgUnit.findUnique.mockResolvedValue({ path: ['root', 'north'] });
      prisma.posting.findMany.mockResolvedValue([
        { userId: 'u1', startedOn: new Date('2026-01-01'), position: { title: 'Finance Manager', orgUnitId: 'north' } },
      ]);
      prisma.orgUnitGrant.findMany.mockResolvedValue([grant()]);

      const result = await service.accessOverUnit('north');

      expect(result.postings).toHaveLength(1);
      expect(result.grants).toHaveLength(1);
    });
  });
});
