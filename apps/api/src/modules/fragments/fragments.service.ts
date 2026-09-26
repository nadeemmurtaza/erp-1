import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../core/config/app-config.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { MicroFrontendFragment } from '../../core/prisma/client';
import type { RegisterFragmentDto, UpdateFragmentDto } from './dto/fragment.dto';

const FRAGMENT_TOKEN_TTL_SECONDS = 5 * 60;
const FRAGMENT_TOKEN_AUDIENCE = 'micro-frontend-fragment';

/**
 * architecture-patterns/143-micro-frontend-architecture.md (WO-143.2/143.3).
 * `MicroFrontendFragment` registers a remote deployment against a fixed set
 * of admin mount points; the actual mount mechanism (WO-143.4, and the
 * substitution recorded in DECISIONS.md ADR-049) is doc 113's own
 * iframe + short-lived embed-token pattern, reused unchanged rather than a
 * literal `next.config.js` module-federation build — `@module-federation/
 * nextjs-mf` does not support this repository's own Next.js 15.
 */
@Injectable()
export class FragmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
  ) {}

  listFragments(activeOnly: boolean): Promise<MicroFrontendFragment[]> {
    return this.prisma.microFrontendFragment.findMany({
      where: activeOnly ? { status: 'ACTIVE' } : undefined,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Every ACTIVE fragment registered for one named mount point — what a mount-point component renders. */
  listForMountPoint(mountPoint: string): Promise<MicroFrontendFragment[]> {
    return this.prisma.microFrontendFragment.findMany({
      where: { status: 'ACTIVE', mountPoints: { has: mountPoint } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * The design-law attestation is enforced by `RegisterFragmentDto`'s own
   * `@Equals(true)` on `attestationConfirmed` before this method is ever
   * reached — this repository's own overflow/contrast tooling cannot reach
   * across a federation boundary, so registration is the one point this
   * repository does control.
   */
  async registerFragment(dto: RegisterFragmentDto, actorId: string): Promise<MicroFrontendFragment> {
    const fragment = await this.prisma.microFrontendFragment.create({
      data: {
        key: dto.key,
        label: dto.label,
        remoteUrl: dto.remoteUrl,
        mountPoints: dto.mountPoints,
        attestedAt: new Date(),
        attestedByUserId: actorId,
      },
    });
    await this.audit.record({ actorId, action: 'fragment.register', entity: 'MicroFrontendFragment', entityId: fragment.id, data: { new: fragment } });
    return fragment;
  }

  async updateFragment(id: string, patch: UpdateFragmentDto, actorId: string): Promise<MicroFrontendFragment> {
    const existing = await this.assertExists(id);
    const fragment = await this.prisma.microFrontendFragment.update({ where: { id }, data: patch });
    await this.audit.record({
      actorId,
      action: 'fragment.update',
      entity: 'MicroFrontendFragment',
      entityId: id,
      data: { old: existing, new: fragment },
    });
    return fragment;
  }

  /**
   * The kill switch this document names: a fragment serving broken or
   * malicious content stops being served with no deploy — its mount point
   * simply renders nothing (the absent-collaborator degrade).
   */
  async suspendFragment(id: string, actorId: string): Promise<MicroFrontendFragment> {
    return this.updateFragment(id, { status: 'SUSPENDED' }, actorId);
  }

  async activateFragment(id: string, actorId: string): Promise<MicroFrontendFragment> {
    return this.updateFragment(id, { status: 'ACTIVE' }, actorId);
  }

  /**
   * Short-lived, scoped to the caller's own identity and the one mount
   * point requested — never a raw session token handed to a third-party
   * iframe, mirroring `EmbedWidgetsService.issueEmbedToken()` exactly.
   */
  async issueFragmentToken(user: AuthenticatedUser, key: string, mountPoint: string): Promise<{ token: string; expiresAt: Date }> {
    const fragment = await this.prisma.microFrontendFragment.findUnique({ where: { key } });
    if (!fragment || fragment.status !== 'ACTIVE') throw new NotFoundException(`No active micro-frontend fragment "${key}".`);
    if (!fragment.mountPoints.includes(mountPoint)) {
      throw new ForbiddenException(`Fragment "${key}" is not registered for mount point "${mountPoint}".`);
    }

    const token = await this.jwt.signAsync(
      { sub: fragment.key, userId: user.id, mountPoint, aud: FRAGMENT_TOKEN_AUDIENCE },
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: FRAGMENT_TOKEN_TTL_SECONDS },
    );
    return { token, expiresAt: new Date(Date.now() + FRAGMENT_TOKEN_TTL_SECONDS * 1000) };
  }

  private async assertExists(id: string): Promise<MicroFrontendFragment> {
    const fragment = await this.prisma.microFrontendFragment.findUnique({ where: { id } });
    if (!fragment) throw new BadRequestException('No such micro-frontend fragment.');
    return fragment;
  }
}
