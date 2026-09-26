import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PermissionsResolverService } from '../../core/auth/permissions.service';
import { SettingsService } from '../../core/settings/settings.service';
import type { OrgUnitReach } from '../../core/auth/scope.guard';
import type { Prisma } from '../../core/prisma/client';

export interface OrgUnitGrantView {
  id: string;
  userId: string;
  orgUnitId: string;
  permissionKeys: string[];
  mode: 'READ' | 'ACTING';
  expiresAt: Date;
  grantedByUserId: string;
  countersignedByUserId: string | null;
  reason: string;
  revokedAt: Date | null;
  createdAt: Date;
}

export type GrantRefusalCode =
  | 'NOT_A_GRANTOR'
  | 'OUT_OF_REACH'
  | 'KEY_NOT_HELD'
  | 'EXPIRY_TOO_FAR'
  | 'NEEDS_COUNTERSIGNATURE';

export interface GrantRefusal {
  code: GrantRefusalCode;
  message: string;
}

export interface IssueGrantInput {
  userId: string;
  orgUnitId: string;
  permissionKeys: PermissionKey[];
  mode: 'READ' | 'ACTING';
  expiresAt: Date;
  reason: string;
  countersignedByUserId?: string;
}

export interface PreviewIssueResult {
  refusals: GrantRefusal[];
}

export interface AccessOverUnit {
  postings: { userId: string; positionTitle: string; orgUnitId: string; startedOn: Date }[];
  grants: OrgUnitGrantView[];
}

const GRANT_SELECT = {
  id: true,
  userId: true,
  orgUnitId: true,
  permissionKeys: true,
  mode: true,
  expiresAt: true,
  grantedByUserId: true,
  countersignedByUserId: true,
  reason: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.OrgUnitGrantSelect;

type GrantRow = Prisma.OrgUnitGrantGetPayload<{ select: typeof GRANT_SELECT }>;

/**
 * access-control-identity/21-access-over-the-org-tree.md — explicit,
 * time-boxed access grants over an `OrgUnit` subtree, and the ceiling on the
 * granter that makes them safe: `issue()` refuses unless all four (five for
 * `ACTING`) checks hold, each with its own named `GrantRefusalCode`.
 *
 * Reads `Posting`/`Position`/`Rank` (hr.prisma, the `hr` module) directly by
 * Prisma query rather than importing anything from `hr`'s own services —
 * `check-module-boundaries.mjs`'s `KNOWN_MODULE_COUPLINGS` is reserved for a
 * same-transaction WRITE, and this is a read; the same "cross-schema Prisma
 * relation without a TS coupling" pattern hr-people-org/20's own
 * `Position.orgUnitId -> OrgUnit` relation already establishes, mirrored in
 * the other direction. The one deliberate duplication this causes — the
 * rank-comparison arithmetic `outranks()` (doc 20, `PeopleService`) already
 * expresses — is a ~1-line pure computation restated here rather than
 * imported, because module independence is exactly the "documented
 * boundary" CLAUDE.md's own "no duplicate implementation" rule carves an
 * exception for.
 */
@Injectable()
export class GrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsResolverService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The granter's own OrgUnit reach — the union of subtrees rooted at every
   * open `Posting` they hold. Holding NO open posting at all is treated as
   * unrestricted, not empty: nothing in this repository's docs 19/20/21
   * build retrofits an existing screen's default visibility for someone
   * with no posting, and the only account that exists on a fresh deployment
   * (ADMIN) holds none — an "empty reach by default" reading would make
   * that account unable to ever issue a first grant. A mid-tree manager
   * (someone WHO HOLDS a posting) is the one this document's own worked
   * example bounds: "a Finance Manager of North reaches North and
   * everything under it, never North's parent."
   */
  async reachOf(userId: string): Promise<OrgUnitReach> {
    const postings = await this.prisma.posting.findMany({
      where: { userId, endedOn: null },
      select: { position: { select: { orgUnitId: true } } },
    });
    if (postings.length === 0) return { isUnrestricted: true, unitIds: [] };
    return { isUnrestricted: false, unitIds: [...new Set(postings.map((p) => p.position.orgUnitId))] };
  }

  /** What `issue()` would refuse, without writing anything — the same computation the button that greys itself out calls. */
  async previewIssue(input: IssueGrantInput, granterId: string): Promise<PreviewIssueResult> {
    return { refusals: await this.checkRefusals(input, granterId) };
  }

  async issue(input: IssueGrantInput, granterId: string): Promise<OrgUnitGrantView> {
    const refusals = await this.checkRefusals(input, granterId);
    if (refusals.length > 0) {
      const first = refusals[0]!;
      if (first.code === 'EXPIRY_TOO_FAR' || first.code === 'NEEDS_COUNTERSIGNATURE') {
        throw new BadRequestException(first.message);
      }
      throw new ForbiddenException(first.message);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgUnitGrant.create({
        data: {
          userId: input.userId,
          orgUnitId: input.orgUnitId,
          permissionKeys: input.permissionKeys,
          mode: input.mode,
          expiresAt: input.expiresAt,
          grantedByUserId: granterId,
          countersignedByUserId: input.mode === 'ACTING' ? input.countersignedByUserId : null,
          reason: input.reason,
        },
        select: GRANT_SELECT,
      });

      await this.audit.recordEvidence(tx, {
        actorId: granterId,
        action: 'org_unit_grant.issued',
        entity: 'OrgUnitGrant',
        entityId: row.id,
        data: {
          userId: input.userId,
          orgUnitId: input.orgUnitId,
          permissionKeys: input.permissionKeys,
          mode: input.mode,
          expiresAt: input.expiresAt,
        },
      });

      return row;
    });

    return toView(created);
  }

  /**
   * The undo needs only `org.access.grant` (checked by the route's own
   * `@RequirePermission`, not re-derived here) — deliberately none of
   * `issue()`'s other four refusals: revoking is safe, granting is not
   * (this document's own words). Idempotent — revoking an already-revoked
   * grant does nothing, the same idiom `PeopleService.end()` already uses
   * for a posting.
   */
  async revoke(grantId: string, actorId: string): Promise<OrgUnitGrantView> {
    const existing = await this.prisma.orgUnitGrant.findUnique({ where: { id: grantId }, select: GRANT_SELECT });
    if (!existing) throw new NotFoundException('That access grant does not exist.');
    if (existing.revokedAt) return toView(existing);

    const revokedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.orgUnitGrant.update({ where: { id: grantId }, data: { revokedAt }, select: GRANT_SELECT });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'org_unit_grant.revoked',
        entity: 'OrgUnitGrant',
        entityId: grantId,
        data: { revokedAt },
      });
      return row;
    });

    return toView(updated);
  }

  /**
   * Marks every already-expired, not-yet-revoked grant as revoked —
   * housekeeping, not correctness: `PermissionsResolverService` and every
   * other reader already filter on `expiresAt > now`, so this only keeps
   * "currently active" (`revokedAt IS NULL`) a cheap query for the access
   * screen rather than something every caller re-derives from `expiresAt`.
   */
  async sweepExpired(): Promise<number> {
    const result = await this.prisma.orgUnitGrant.updateMany({
      where: { expiresAt: { lt: new Date() }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /**
   * "Who reaches this unit, by posting or by grant" (WO-21.6) — the reverse
   * of `reachOf()`: every OPEN posting, and every currently-valid grant, at
   * this unit or any of its ancestors (this unit's own `path`), since a
   * Finance Manager of North reaches North's descendants including this one.
   */
  async accessOverUnit(unitId: string): Promise<AccessOverUnit> {
    const unit = await this.prisma.orgUnit.findUnique({ where: { id: unitId }, select: { path: true } });
    if (!unit) throw new NotFoundException('That org unit does not exist.');

    const [postings, grants] = await Promise.all([
      this.prisma.posting.findMany({
        where: { endedOn: null, position: { orgUnitId: { in: unit.path } } },
        select: { userId: true, startedOn: true, position: { select: { title: true, orgUnitId: true } } },
      }),
      this.prisma.orgUnitGrant.findMany({
        where: { orgUnitId: { in: unit.path }, revokedAt: null, expiresAt: { gt: new Date() } },
        select: GRANT_SELECT,
      }),
    ]);

    return {
      postings: postings.map((p) => ({
        userId: p.userId,
        positionTitle: p.position.title,
        orgUnitId: p.position.orgUnitId,
        startedOn: p.startedOn,
      })),
      grants: grants.map(toView),
    };
  }

  private async checkRefusals(input: IssueGrantInput, granterId: string): Promise<GrantRefusal[]> {
    const refusals: GrantRefusal[] = [];

    const granterPermissions = await this.permissions.resolveForUser(granterId);
    const held = new Set(granterPermissions.permissions);

    if (!held.has('org.access.grant')) {
      refusals.push({ code: 'NOT_A_GRANTOR', message: 'You do not hold "org.access.grant".' });
    }

    const reach = await this.reachOf(granterId);
    if (!reach.isUnrestricted) {
      const target = await this.prisma.orgUnit.findUnique({ where: { id: input.orgUnitId }, select: { path: true } });
      const inReach = target ? reach.unitIds.some((rootId) => target.path.includes(rootId)) : false;
      if (!inReach) {
        refusals.push({
          code: 'OUT_OF_REACH',
          message: 'That unit is outside your own reachable subtree — you cannot grant sideways or upward.',
        });
      }
    }

    const missingKeys = input.permissionKeys.filter((key) => !held.has(key));
    if (missingKeys.length > 0) {
      refusals.push({
        code: 'KEY_NOT_HELD',
        message: `You do not hold "${missingKeys.join('", "')}" yourself — you cannot confer what you were never given.`,
      });
    }

    const maxDays = await this.settings.getOrgAccessMaxGrantDays();
    const latestAllowed = new Date();
    latestAllowed.setDate(latestAllowed.getDate() + maxDays);
    if (input.expiresAt.getTime() > latestAllowed.getTime()) {
      refusals.push({
        code: 'EXPIRY_TOO_FAR',
        message: `A grant cannot run longer than ${maxDays} days from now.`,
      });
    }

    if (input.mode === 'ACTING') {
      if (!input.countersignedByUserId) {
        refusals.push({
          code: 'NEEDS_COUNTERSIGNATURE',
          message: 'An ACTING grant needs a countersignature from someone who outranks the recipient.',
        });
      } else {
        const [granteeRanks, countersignerRanks] = await Promise.all([
          this.openPostingRankLevels(input.userId),
          this.openPostingRankLevels(input.countersignedByUserId),
        ]);
        const countersignerOutranks = maxRank(countersignerRanks) > maxRank(granteeRanks);
        if (!countersignerOutranks) {
          refusals.push({
            code: 'NEEDS_COUNTERSIGNATURE',
            message: 'The countersigner does not outrank the recipient.',
          });
        }
      }
    }

    return refusals;
  }

  private async openPostingRankLevels(userId: string): Promise<number[]> {
    const rows = await this.prisma.posting.findMany({
      where: { userId, endedOn: null },
      select: { position: { select: { rank: { select: { level: true } } } } },
    });
    return rows.map((row) => row.position.rank.level);
  }
}

/** Doc 20's own `outranks()` rule restated: the maximum, never the first-found; an empty array is unrankable — see this file's own header comment for why this is duplicated rather than imported. */
function maxRank(levels: readonly number[]): number {
  return levels.length === 0 ? -Infinity : Math.max(...levels);
}

function toView(row: GrantRow): OrgUnitGrantView {
  return {
    id: row.id,
    userId: row.userId,
    orgUnitId: row.orgUnitId,
    permissionKeys: row.permissionKeys,
    mode: row.mode,
    expiresAt: row.expiresAt,
    grantedByUserId: row.grantedByUserId,
    countersignedByUserId: row.countersignedByUserId,
    reason: row.reason,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}
