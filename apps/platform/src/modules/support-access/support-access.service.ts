import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import type { SupportAccessGrant } from '../../core/prisma/client';
import type { IssueGrantDto } from './dto/issue-grant.dto';

/**
 * WO-39.5 — the one genuinely new trust boundary doc 39 §3 names: a Newax
 * support engineer reaching into a tenant's isolated deployment. Every
 * grant expires (`expiresAt`, never optional), every actual use is
 * appended to `accessedAt`, and a DEDICATED-tier tenant's contract-
 * mandated second approval is enforced here, not merely documented.
 */
@Injectable()
export class SupportAccessService {
  private readonly logger = new Logger(SupportAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async issue(dto: IssueGrantDto): Promise<SupportAccessGrant> {
    const tenant = await this.prisma.platformTenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException(`No tenant with id ${dto.tenantId}`);

    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be a valid future timestamp.');
    }
    const maxMs = this.config.get('PLATFORM_SUPPORT_GRANT_MAX_HOURS') * 60 * 60 * 1000;
    if (expiresAt.getTime() - Date.now() > maxMs) {
      throw new BadRequestException(
        `expiresAt cannot be more than ${this.config.get('PLATFORM_SUPPORT_GRANT_MAX_HOURS')} hours out — support access is never indefinite.`,
      );
    }

    return this.prisma.supportAccessGrant.create({
      data: {
        tenantId: dto.tenantId,
        grantedToUserId: dto.grantedToUserId,
        reason: dto.reason,
        expiresAt,
      },
    });
  }

  async approve(id: string, approvedByUserId: string): Promise<SupportAccessGrant> {
    const grant = await this.getById(id);
    if (grant.approvedByUserId) {
      throw new BadRequestException('This grant is already approved.');
    }
    if (grant.revokedAt) {
      throw new BadRequestException('A revoked grant cannot be approved.');
    }
    // Doc 39's own "toxic pair": the engineer a grant is FOR can never also
    // be the one who approves it — enforced unconditionally, not only for
    // DEDICATED tenants, since a lighter tier still deserves this floor.
    if (approvedByUserId === grant.grantedToUserId) {
      throw new ForbiddenException('The engineer a grant is for cannot also approve it.');
    }

    return this.prisma.supportAccessGrant.update({
      where: { id },
      data: { approvedByUserId },
    });
  }

  async revoke(id: string): Promise<SupportAccessGrant> {
    const grant = await this.getById(id);
    if (grant.revokedAt) return grant;
    return this.prisma.supportAccessGrant.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /**
   * The audit-trail write for an actual use of a live grant — doc 39 §3's
   * "every actual access while a grant is live is logged." Access control
   * lives here, not in `markedInertAt`: a DEDICATED-tier grant awaiting its
   * second approval, a revoked grant, or one past `expiresAt` is refused
   * regardless of whether the expiry cron has run yet.
   */
  async recordAccess(id: string): Promise<SupportAccessGrant> {
    const grant = await this.getById(id);
    const tenant = await this.prisma.platformTenant.findUniqueOrThrow({ where: { id: grant.tenantId } });

    if (grant.revokedAt) throw new ForbiddenException('This grant has been revoked.');
    if (grant.expiresAt.getTime() <= Date.now()) throw new ForbiddenException('This grant has expired.');
    if (tenant.resourceTier === 'DEDICATED' && !grant.approvedByUserId) {
      throw new ForbiddenException('This DEDICATED-tenant grant has not yet been approved.');
    }

    this.logger.log(`SupportAccessGrant ${id} accessed for tenant ${grant.tenantId}`);
    return this.prisma.supportAccessGrant.update({
      where: { id },
      data: { accessedAt: { push: new Date() } },
    });
  }

  async getById(id: string): Promise<SupportAccessGrant> {
    const grant = await this.prisma.supportAccessGrant.findUnique({ where: { id } });
    if (!grant) throw new NotFoundException(`No support access grant with id ${id}`);
    return grant;
  }

  /** Retrievable by ticket reference — `reason` carries the freetext
   *  ticket reference doc 39 §3 names. */
  async findByTicketReference(reason: string): Promise<SupportAccessGrant[]> {
    return this.prisma.supportAccessGrant.findMany({
      where: { reason: { contains: reason, mode: 'insensitive' } },
      orderBy: { startsAt: 'desc' },
    });
  }

  async listForTenant(tenantId: string): Promise<SupportAccessGrant[]> {
    return this.prisma.supportAccessGrant.findMany({ where: { tenantId }, orderBy: { startsAt: 'desc' } });
  }

  /** WO-39.5's own cron target — display-only, see the schema's own doc
   *  comment on `markedInertAt`. */
  async markExpiredInert(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.supportAccessGrant.updateMany({
      where: { expiresAt: { lte: now }, markedInertAt: null },
      data: { markedInertAt: now },
    });
    return result.count;
  }
}
