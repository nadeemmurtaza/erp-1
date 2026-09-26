import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ApprovalChain, ApprovalSubjectType, Prisma } from '../prisma/client';

export interface ApprovalStepInput {
  /** Informational only — the permission key or role a step is expected to
   * be decided under. Who may actually call decide() is enforced by the
   * caller's own route guard (@RequirePermission), never resolved here —
   * this service does not re-implement PBAC. */
  approverRoleId?: string;
  approverUserId?: string;
  /**
   * doc 149 — any ONE of these Contact ids (never a User of this
   * deployment) may decide this step; a set, not a sequence. Who is
   * actually allowed to call decide() with one of these ids is still the
   * caller's own concern (AccountsService checks membership), same
   * division of responsibility as approverRoleId above.
   */
  approverContactIds?: string[];
}

export type ApprovalDecision = 'APPROVE' | 'REJECT';

/** Which id column decide()'s actorId is written to. Defaults to 'USER' so
 * every existing caller (requisitions, wallet adjustments) is unaffected. */
export type ApprovalActorKind = 'USER' | 'CONTACT';

/**
 * One generic approval chain, referenced by (subjectType, subjectId) rather
 * than a bespoke chain per feature — docs/implementation/hr-people-org/
 * 63-multi-tier-approval-hierarchies.md's own shape. `ApprovalService` is
 * the one writer to `ApprovalChain`/`ApprovalStep`; a subject module (e.g.
 * `RequisitionService`) starts a chain, decides its steps, and reads the
 * resulting status back — it never manages steps itself.
 *
 * This service does not resolve "who may decide a step" — that is the
 * caller's own permission gate (a route's `@RequirePermission`) and, for a
 * self-approval refusal, the caller's own comparison against its subject's
 * requester — exactly House Rule security engineering's "enforced
 * server-side, never re-implemented per subject type."
 */
@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async start(
    subjectType: ApprovalSubjectType,
    subjectId: string,
    steps: ApprovalStepInput[],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ApprovalChain> {
    if (steps.length === 0) {
      throw new BadRequestException('An approval chain needs at least one step.');
    }
    for (const step of steps) {
      const hasContacts = (step.approverContactIds?.length ?? 0) > 0;
      if (!step.approverRoleId && !step.approverUserId && !hasContacts) {
        throw new BadRequestException(
          'Every approval step needs an approverRoleId, an approverUserId, or at least one approverContactId.',
        );
      }
    }

    const existing = await tx.approvalChain.findUnique({ where: { subjectType_subjectId: { subjectType, subjectId } } });
    if (existing) {
      throw new ConflictException(`An approval chain already exists for ${subjectType} ${subjectId}.`);
    }

    return tx.approvalChain.create({
      data: {
        subjectType,
        subjectId,
        steps: {
          create: steps.map((step, index) => ({
            stepOrder: index + 1,
            approverRoleId: step.approverRoleId ?? null,
            approverUserId: step.approverUserId ?? null,
            approverContactIds: step.approverContactIds ?? [],
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  async getChain(
    subjectType: ApprovalSubjectType,
    subjectId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.approvalChain.findUnique({
      where: { subjectType_subjectId: { subjectType, subjectId } },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }

  /**
   * Advances `currentStep` on APPROVE; on the last step's APPROVE, the chain
   * itself moves to APPROVED. On any REJECT, every remaining PENDING step is
   * marked SKIPPED and the chain moves to REJECTED — never re-decided once
   * terminal.
   */
  async decide(
    chainId: string,
    stepId: string,
    decision: ApprovalDecision,
    actorId: string,
    comment?: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
    actorKind: ApprovalActorKind = 'USER',
  ): Promise<ApprovalChain> {
    const chain = await tx.approvalChain.findUnique({
      where: { id: chainId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!chain) throw new NotFoundException('Approval chain not found.');
    if (chain.status !== 'PENDING') {
      throw new ConflictException(`This approval chain is already ${chain.status}.`);
    }

    const step = chain.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException('Approval step not found on this chain.');
    if (step.stepOrder !== chain.currentStep) {
      throw new ConflictException('This is not the chain\'s current step — steps decide in order.');
    }
    if (step.status !== 'PENDING') {
      throw new ConflictException(`This step is already ${step.status}.`);
    }

    await tx.approvalStep.update({
      where: { id: stepId },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedAt: new Date(),
        // decidedById's own @relation is typed to User, so a Contact's id
        // (actorKind === 'CONTACT') is written to decidedByContactId
        // instead — never into a column with a foreign key it cannot
        // satisfy.
        decidedById: actorKind === 'USER' ? actorId : null,
        decidedByContactId: actorKind === 'CONTACT' ? actorId : null,
        comment: comment?.trim() || null,
      },
    });

    if (decision === 'REJECT') {
      await tx.approvalStep.updateMany({
        where: { chainId, status: 'PENDING', id: { not: stepId } },
        data: { status: 'SKIPPED' },
      });
      return tx.approvalChain.update({
        where: { id: chainId },
        data: { status: 'REJECTED' },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    }

    const isLastStep = step.stepOrder === chain.steps.length;
    return tx.approvalChain.update({
      where: { id: chainId },
      data: isLastStep ? { status: 'APPROVED', currentStep: step.stepOrder } : { currentStep: step.stepOrder + 1 },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
  }
}
