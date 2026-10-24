import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PolicyQuarantine } from '../prisma/client';

export interface PolicyQuarantineInput {
  originNodeId: string;
  entity: string;
  entityId: string;
  /** The BrandPolicy column violated — e.g. "allowBranchLocalPurchasing". */
  policyKey: string;
  /** Null when the origin node carries no `retailBrandId` — `reason` says so. */
  retailBrandId: string | null;
  payload: unknown;
  reason: string;
}

/**
 * R9's OTHER quarantine (WO-23.3c/e, ADR-023) — a fact that applied
 * successfully but whose own `scopeLevel` disagrees with the `BrandPolicy`
 * switch meant to govern the node that raised it. Deliberately a separate
 * table and service from `ReplicationQuarantineService`: that one is for a
 * record that failed to apply at all (a bug, a schema mismatch); this one
 * is for a record that is technically fine but governance-flagged — R5/R2
 * both forbid rejecting it, so it is never routed through the apply-failure
 * path. `resolve()` is the same manual, audited step its sibling uses,
 * with an actor and a note recorded — "quarantined for review" with no
 * record of what the review concluded is not a review.
 */
@Injectable()
export class PolicyQuarantineService {
  constructor(private readonly prisma: PrismaService) {}

  async quarantine(input: PolicyQuarantineInput): Promise<PolicyQuarantine> {
    return this.prisma.policyQuarantine.create({
      data: {
        originNodeId: input.originNodeId,
        entity: input.entity,
        entityId: input.entityId,
        policyKey: input.policyKey,
        retailBrandId: input.retailBrandId,
        payload: input.payload as object,
        reason: input.reason,
      },
    });
  }

  async get(id: string): Promise<PolicyQuarantine | null> {
    return this.prisma.policyQuarantine.findUnique({ where: { id } });
  }

  async listOpen(): Promise<PolicyQuarantine[]> {
    return this.prisma.policyQuarantine.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolve(id: string, actorId: string | null, note?: string): Promise<PolicyQuarantine> {
    const existing = await this.prisma.policyQuarantine.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Quarantined record not found.');

    return this.prisma.policyQuarantine.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolvedNote: note,
      },
    });
  }
}
