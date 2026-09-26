import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import type { PlatformRateCardChangeRequest } from '../../core/prisma/client';

export interface ProposeRateCardChangeInput {
  planId: string;
  transactionFeeBps?: number;
  usageRateCardMinor?: Record<string, number>;
  includedAllowances?: Record<string, number>;
  requestedByOpsClientId: string;
}

/**
 * doc 153 WO-153.4 — the same create/approve split doc 50 §4 already
 * established for a custom-quote discount (`CustomQuoteService`), reused
 * here for a rate-card change to a live USAGE_BASED `PlatformPlan`. Doc
 * 153's own "authority and blast radius" lens: a misconfigured rate card
 * overcharges every tenant on this plan, so a change moving
 * `transactionFeeBps` by more than `PLATFORM_RATE_CARD_APPROVAL_THRESHOLD_BPS`
 * needs a second approver — never the ops client who proposed it (the same
 * "toxic pair" refusal `CustomQuoteService.approve()` already enforces).
 *
 * A change that touches only `usageRateCardMinor`/`includedAllowances` (no
 * `transactionFeeBps` move) always requires approval too — there is no
 * "safe" JSON-only edit exempt from review, since the same JSON also
 * carries the `"<dimension>_over_limit"` step-up fees this lens is about.
 */
@Injectable()
export class RateCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async proposeChange(input: ProposeRateCardChangeInput): Promise<PlatformRateCardChangeRequest> {
    const plan = await this.prisma.platformPlan.findUnique({ where: { id: input.planId } });
    if (!plan) throw new NotFoundException(`No plan with id ${input.planId}`);
    if (plan.pricingModel !== 'USAGE_BASED') {
      throw new BadRequestException(`Plan ${plan.key} is not USAGE_BASED — it has no rate card to change.`);
    }
    if (
      input.transactionFeeBps === undefined &&
      input.usageRateCardMinor === undefined &&
      input.includedAllowances === undefined
    ) {
      throw new BadRequestException('Propose at least one changed field.');
    }

    const threshold = this.config.get('PLATFORM_RATE_CARD_APPROVAL_THRESHOLD_BPS');
    const currentBps = plan.transactionFeeBps ?? 0;
    const bpsMove = input.transactionFeeBps === undefined ? 0 : Math.abs(input.transactionFeeBps - currentBps);
    // A rate-card JSON edit (messages/allowances) is never treated as a
    // "safe, no move" change — only an unchanged transactionFeeBps AND no
    // JSON edit at all would be, and proposeChange() already rejects an
    // empty proposal above, so any JSON-only proposal always requires
    // approval regardless of bpsMove.
    const requiresApproval =
      bpsMove > threshold || input.usageRateCardMinor !== undefined || input.includedAllowances !== undefined;

    return this.prisma.platformRateCardChangeRequest.create({
      data: {
        planId: input.planId,
        proposedTransactionFeeBps: input.transactionFeeBps ?? null,
        proposedUsageRateCardMinor: input.usageRateCardMinor ?? undefined,
        proposedIncludedAllowances: input.includedAllowances ?? undefined,
        requiresApproval,
        status: requiresApproval ? 'PENDING' : 'APPROVED',
        requestedByOpsClientId: input.requestedByOpsClientId,
        approvedAt: requiresApproval ? null : new Date(),
      },
    });
  }

  /** Approving does not itself apply the change — `apply()` does, so an
   *  approver can review an already-approved-but-not-yet-live change one
   *  more time before it takes effect. */
  async approve(id: string, approvedByOpsClientId: string): Promise<PlatformRateCardChangeRequest> {
    const request = await this.getById(id);
    if (request.status !== 'PENDING') throw new BadRequestException(`Rate-card change ${id} is not pending approval.`);
    if (request.requestedByOpsClientId === approvedByOpsClientId) {
      throw new ForbiddenException('The ops client who proposed a rate-card change cannot also approve it.');
    }

    return this.prisma.platformRateCardChangeRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedByOpsClientId, approvedAt: new Date() },
    });
  }

  async reject(id: string, reason: string): Promise<PlatformRateCardChangeRequest> {
    const request = await this.getById(id);
    if (request.status !== 'PENDING') throw new BadRequestException(`Rate-card change ${id} is not pending approval.`);
    return this.prisma.platformRateCardChangeRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    });
  }

  /** Writes an APPROVED request's proposed values onto its `PlatformPlan`
   *  — the actual "audit row carrying old and new value" doc 153's own
   *  "authority and blast radius" lens asks for is this row itself, read
   *  back from `PlatformRateCardChangeRequest` (old = the plan's value
   *  before this call, new = what it becomes), never a separate log. */
  async apply(id: string): Promise<PlatformRateCardChangeRequest> {
    const request = await this.getById(id);
    if (request.status !== 'APPROVED') throw new BadRequestException(`Rate-card change ${id} is not approved.`);

    const plan = await this.prisma.platformPlan.findUnique({ where: { id: request.planId } });
    if (!plan) throw new NotFoundException(`No plan with id ${request.planId}`);

    await this.prisma.platformPlan.update({
      where: { id: request.planId },
      data: {
        transactionFeeBps: request.proposedTransactionFeeBps ?? plan.transactionFeeBps,
        usageRateCardMinor: request.proposedUsageRateCardMinor ?? plan.usageRateCardMinor ?? undefined,
        includedAllowances: request.proposedIncludedAllowances ?? plan.includedAllowances ?? undefined,
      },
    });

    return this.prisma.platformRateCardChangeRequest.update({
      where: { id },
      data: { appliedAt: new Date() },
    });
  }

  async getById(id: string): Promise<PlatformRateCardChangeRequest> {
    const request = await this.prisma.platformRateCardChangeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`No rate-card change request with id ${id}`);
    return request;
  }

  async listForPlan(planId: string): Promise<PlatformRateCardChangeRequest[]> {
    return this.prisma.platformRateCardChangeRequest.findMany({ where: { planId }, orderBy: { createdAt: 'desc' } });
  }

  async listPending(): Promise<PlatformRateCardChangeRequest[]> {
    return this.prisma.platformRateCardChangeRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  }
}
