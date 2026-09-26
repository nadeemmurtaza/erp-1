import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { PlatformPlan } from '../../core/prisma/client';
import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';

/**
 * doc 154 §1's own fixed mapping from an existing `PricingModel` to the
 * customer-facing name the pricing page shows it under — never a stored
 * column, since it is a pure, total function of `pricingModel` and storing
 * it separately would just be a second place it could drift from doc 154's
 * own table. `PER_SEAT` has no entry: it is never a headline plan
 * (`PlansService.update()` refuses to mark one), so `getPlanComparison()`
 * never needs to name it.
 */
const HEADLINE_PLAN_KEY: Partial<Record<PlatformPlan['pricingModel'], 'LIFETIME_LICENSE' | 'PER_MONTH' | 'PAY_AS_YOU_GROW'>> = {
  ONE_TIME_LICENSE: 'LIFETIME_LICENSE',
  FLAT_MONTHLY: 'PER_MONTH',
  USAGE_BASED: 'PAY_AS_YOU_GROW',
};

/** doc 154 §3's own literal `PlanComparisonRow` sketch, plus `key` — the
 *  actual `PlatformPlan.key` a CTA needs to hand straight to doc 51's
 *  existing `RequestSignupDto.planKey` (§4: "no new provisioning
 *  mechanism, only a new entry point into the two that already exist").
 *  Deliberately never carries `transactionFeeBps`/`usageRateCardMinor` or
 *  any other internal billing figure — doc 154's own "whose rows, and
 *  which columns" scope lens. */
export interface PlanComparisonRow {
  planKey: 'LIFETIME_LICENSE' | 'PER_MONTH' | 'PAY_AS_YOU_GROW';
  key: string;
  displayName: string;
  priceDescription: string;
  hostingMode: 'OFFLINE' | 'ONLINE' | 'EITHER';
  bestFor: string;
  ctaLabel: string;
}

/** WO-50.1/50.5 — the plan catalogue itself: create and list, each of the
 *  three pricing shapes validated for the fields its own model needs. */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlanDto): Promise<PlatformPlan> {
    const existing = await this.prisma.platformPlan.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`A plan with key "${dto.key}" already exists.`);

    if (dto.pricingModel === 'PER_SEAT' && dto.perSeatPriceMinor == null) {
      throw new BadRequestException('perSeatPriceMinor is required for a PER_SEAT plan.');
    }
    if (dto.pricingModel === 'ONE_TIME_LICENSE' && (dto.oneTimeLicenseMinor == null || !dto.licenseDeploymentMode)) {
      throw new BadRequestException('oneTimeLicenseMinor and licenseDeploymentMode are required for a ONE_TIME_LICENSE plan.');
    }
    if (dto.pricingModel === 'USAGE_BASED' && dto.transactionFeeBps == null) {
      throw new BadRequestException('transactionFeeBps is required for a USAGE_BASED plan.');
    }

    return this.prisma.platformPlan.create({
      data: {
        key: dto.key,
        editionCap: dto.editionCap,
        includedResourceTier: dto.includedResourceTier,
        pricingModel: dto.pricingModel,
        monthlyPriceMinor: dto.pricingModel === 'FLAT_MONTHLY' ? (dto.monthlyPriceMinor ?? 0) : 0,
        perSeatPriceMinor: dto.pricingModel === 'PER_SEAT' ? dto.perSeatPriceMinor : null,
        oneTimeLicenseMinor: dto.pricingModel === 'ONE_TIME_LICENSE' ? dto.oneTimeLicenseMinor : null,
        licenseDeploymentMode: dto.pricingModel === 'ONE_TIME_LICENSE' ? dto.licenseDeploymentMode : null,
        transactionFeeBps: dto.pricingModel === 'USAGE_BASED' ? dto.transactionFeeBps : null,
        usageRateCardMinor: dto.pricingModel === 'USAGE_BASED' ? (dto.usageRateCardMinor ?? {}) : undefined,
        includedAllowances: dto.pricingModel === 'USAGE_BASED' ? (dto.includedAllowances ?? {}) : undefined,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async list(): Promise<PlatformPlan[]> {
    return this.prisma.platformPlan.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * WO-154.1/154.3 — the one write doc 154 adds to an existing
   * `PlatformPlan` row: its headline flag/order and its public copy.
   * Gated identically to `create()` above by `PlansController`'s own
   * class-level `@RequireOpsPermission('platform.billing.manage')` — doc
   * 154's own "gated the same as any other PlatformPlan field change doc
   * 153 already requires" scope lens, not a new permission.
   *
   * Predicate-on-write, not admin discipline alone: a `PER_SEAT` plan can
   * never become headline (doc 154 §1 — "never presented as a fourth
   * tile"), and a plan cannot become headline with no `headlineOrder` at
   * all — `getPlanComparison()` sorts by that column, and a `null` there
   * would make the comparison page's order undefined.
   */
  async update(id: string, dto: UpdatePlanDto): Promise<PlatformPlan> {
    const plan = await this.prisma.platformPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`No plan with id ${id}`);

    const nextIsHeadline = dto.isHeadline ?? plan.isHeadline;
    if (nextIsHeadline) {
      if (plan.pricingModel === 'PER_SEAT') {
        throw new BadRequestException(
          'PER_SEAT is deliberately never a headline plan (doc 154 §1) — route it through the "talk to us" path instead of the comparison grid.',
        );
      }
      if ((dto.headlineOrder ?? plan.headlineOrder) == null) {
        throw new BadRequestException('headlineOrder is required when marking a plan isHeadline.');
      }
    }

    return this.prisma.platformPlan.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.priceDescription !== undefined ? { priceDescription: dto.priceDescription } : {}),
        ...(dto.bestFor !== undefined ? { bestFor: dto.bestFor } : {}),
        ...(dto.ctaLabel !== undefined ? { ctaLabel: dto.ctaLabel } : {}),
        isHeadline: nextIsHeadline,
        headlineOrder: nextIsHeadline ? (dto.headlineOrder ?? plan.headlineOrder) : null,
      },
    });
  }

  /**
   * WO-154.3 — doc 154 §3's own read, verbatim shape (plus `key`, see
   * `PlanComparisonRow`'s own doc comment). Reads only `isHeadline: true`
   * rows, ordered by `headlineOrder`; an `isActive: false` plan is filtered
   * out too — a headline plan nobody can actually sign up for would be a
   * broken CTA, exactly what doc 154's own "the failure path" scope lens
   * (never a broken grid) refuses. Zero matching rows returns `[]` — the
   * pricing page's own "the absent collaborator" empty state, never an
   * error.
   */
  async getPlanComparison(): Promise<PlanComparisonRow[]> {
    const plans = await this.prisma.platformPlan.findMany({
      where: { isHeadline: true, isActive: true },
      orderBy: { headlineOrder: 'asc' },
    });

    // Defensive, not merely decorative: `update()` already refuses to mark
    // a PER_SEAT plan headline, but a row with no entry in
    // HEADLINE_PLAN_KEY (a mistake, or a PricingModel a future doc adds
    // with no headline name yet) is dropped here rather than mislabeled —
    // the same "never a broken tile" failure-path lens, applied one layer
    // deeper than the write-time guard.
    return plans.flatMap((plan) => {
      const planKey = HEADLINE_PLAN_KEY[plan.pricingModel];
      if (!planKey) return [];
      return [
        {
          planKey,
          key: plan.key,
          displayName: plan.displayName ?? plan.key,
          priceDescription: plan.priceDescription ?? '',
          hostingMode:
            plan.pricingModel === 'ONE_TIME_LICENSE'
              ? ((plan.licenseDeploymentMode as 'OFFLINE' | 'ONLINE' | null) ?? 'ONLINE')
              : 'ONLINE',
          bestFor: plan.bestFor ?? '',
          ctaLabel: plan.ctaLabel ?? 'Get started',
        },
      ];
    });
  }
}
