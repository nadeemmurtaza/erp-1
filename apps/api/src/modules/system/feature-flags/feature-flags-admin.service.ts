import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { FeatureFlag } from '../../../core/prisma/client';
import type { CreateFeatureFlagDto, ProposeRolloutDto, UpdateFeatureFlagDto } from './dto/feature-flag.dto';

/** WO-37.3's own staleness window: "no stated removal criteria past 90 days." */
const STALENESS_DAYS = 90;

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.2/37.5)
 * — the admin CRUD surface over `FeatureFlag`, plus the maker-checker pair
 * for the one transition doc 37's own "threshold nobody approves alone"
 * lens names: raising a money/stock-path flag to 100% rollout, or clearing
 * its `killSwitch`. Mirrors `SettlementsService.requestWriteoff()`/
 * `.approveWriteoff()` exactly — the same "never the same person" refusal,
 * the same "checked again here, never trusted from the route decorator
 * alone" discipline.
 */
@Injectable()
export class FeatureFlagsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<FeatureFlag[]> {
    return this.prisma.featureFlag.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string): Promise<FeatureFlag> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!flag) throw new NotFoundException('Feature flag not found.');
    return flag;
  }

  /**
   * WO-37.3's own report: every flag older than the staleness window with
   * no stated removal criteria. A real, on-demand query — never a stale
   * cache — so the admin screen and the nightly cron's log line always
   * agree with each other and with the database.
   */
  async listStale(): Promise<FeatureFlag[]> {
    const cutoff = new Date(Date.now() - STALENESS_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.featureFlag.findMany({
      where: { removalCriteria: null, createdAt: { lt: cutoff } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateFeatureFlagDto, actorId: string): Promise<FeatureFlag> {
    const flag = await this.prisma.featureFlag.create({
      data: {
        key: dto.key,
        description: dto.description,
        removalCriteria: dto.removalCriteria ?? null,
        moneyOrStockPath: dto.moneyOrStockPath ?? false,
      },
    });

    await this.audit.record({ actorId, action: 'feature_flag.created', entity: 'FeatureFlag', entityId: flag.id, data: { key: flag.key } });
    return flag;
  }

  /**
   * The routine edit surface. `killSwitch: true` and any `rolloutPercent`
   * below 100 on a `moneyOrStockPath` flag apply immediately — turning risk
   * DOWN never needs a second approver, only turning it up does.
   * `killSwitch: false` or `rolloutPercent: 100` on a `moneyOrStockPath`
   * flag are refused here and must go through `proposeRollout()` +
   * `approveRollout()` instead.
   */
  async update(id: string, dto: UpdateFeatureFlagDto, actorId: string): Promise<FeatureFlag> {
    const flag = await this.get(id);

    if (flag.moneyOrStockPath) {
      if (dto.killSwitch === false) {
        throw new ForbiddenException(
          'Clearing the kill switch on a money/stock-path flag needs a second approver — propose the change, then have someone else approve it.',
        );
      }
      if (dto.rolloutPercent === 100) {
        throw new ForbiddenException(
          'Raising a money/stock-path flag to 100% rollout needs a second approver — propose the change, then have someone else approve it.',
        );
      }
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        description: dto.description ?? undefined,
        removalCriteria: dto.removalCriteria === undefined ? undefined : dto.removalCriteria,
        killSwitch: dto.killSwitch ?? undefined,
        rolloutPercent: dto.rolloutPercent ?? undefined,
        enabledOrgIds: dto.enabledOrgIds ?? undefined,
      },
    });

    this.flags.invalidate(updated.key);
    await this.audit.record({ actorId, action: 'feature_flag.updated', entity: 'FeatureFlag', entityId: id, data: dto });
    return updated;
  }

  /** The maker half — anyone holding `platform.flags.manage` may propose; approving is a different permission and (enforced below) a different person. */
  async proposeRollout(id: string, dto: ProposeRolloutDto, actorId: string): Promise<FeatureFlag> {
    const flag = await this.get(id);
    if (!flag.moneyOrStockPath) {
      throw new BadRequestException('Only a money/stock-path flag needs a proposed rollout — edit this flag directly instead.');
    }
    if (dto.rolloutPercent === undefined && !dto.killSwitchOff) {
      throw new BadRequestException('Propose a rolloutPercent, killSwitchOff, or both.');
    }

    const updated = await this.prisma.featureFlag.update({
      where: { id },
      data: {
        proposedRolloutPercent: dto.rolloutPercent ?? null,
        proposedKillSwitchOff: dto.killSwitchOff ?? false,
        proposedById: actorId,
        proposedAt: new Date(),
      },
    });

    await this.audit.record({ actorId, action: 'feature_flag.rollout_proposed', entity: 'FeatureFlag', entityId: id, data: dto });
    return updated;
  }

  /** The checker half — never the same person as `proposeRollout()`, enforced here, never trusted from the route decorator alone. */
  async approveRollout(id: string, actorId: string): Promise<FeatureFlag> {
    return this.prisma.$transaction(async (tx) => {
      const flag = await tx.featureFlag.findUnique({ where: { id } });
      if (!flag) throw new NotFoundException('Feature flag not found.');
      if (!flag.proposedById) throw new ConflictException('No rollout change has been proposed for this flag.');
      if (flag.proposedById === actorId) {
        throw new ForbiddenException('The person who proposed a rollout change cannot approve their own.');
      }

      const updated = await tx.featureFlag.update({
        where: { id },
        data: {
          rolloutPercent: flag.proposedRolloutPercent ?? flag.rolloutPercent,
          killSwitch: flag.proposedKillSwitchOff ? false : flag.killSwitch,
          proposedRolloutPercent: null,
          proposedKillSwitchOff: false,
          proposedById: null,
          proposedAt: null,
          approvedById: actorId,
          approvedAt: new Date(),
        },
      });

      this.flags.invalidate(updated.key);
      await this.audit.record({
        actorId,
        action: 'feature_flag.rollout_approved',
        entity: 'FeatureFlag',
        entityId: id,
        data: { rolloutPercent: updated.rolloutPercent, killSwitch: updated.killSwitch, proposedById: flag.proposedById },
      });
      return updated;
    });
  }
}
