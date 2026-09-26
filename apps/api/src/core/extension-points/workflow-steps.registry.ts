import { Injectable } from '@nestjs/common';
import type { ApprovalSubjectType } from '../prisma/client';

export interface CompiledApprovalStep {
  approverRoleId?: string;
  approverUserId?: string;
}

export interface WorkflowStepsHandler {
  /** `null` means no BPMN-authored definition exists for this subject type — the caller falls back to its own hardcoded default steps. */
  getCompiledSteps(subjectType: ApprovalSubjectType): Promise<CompiledApprovalStep[] | null>;
}

/**
 * Lets a subject module (`purchasing`'s `RequisitionService`, doc 63's own
 * consumer) ask "has a manager redrawn this chain's shape in the BPMN
 * editor?" without importing `bpmn-workflows` directly — the core-internal
 * counterpart to `BranchPolicyRegistry`/`StockIntakeRegistry`, same file,
 * same reasoning (architecture-patterns/142-bpmn-visual-workflow-engine.md,
 * DECISIONS.md ADR-049). A subject type with no BPMN definition (or the
 * `bpmn-workflows` module absent entirely) answers `null`, never throws —
 * the hardcoded default this codebase already ships is always a safe
 * fallback, so a diagram is optional, never load-bearing infrastructure.
 */
@Injectable()
export class WorkflowStepsRegistry {
  private handler: WorkflowStepsHandler | null = null;

  /** Called once, from `bpmn-workflows`'s own `onModuleInit()`. */
  register(handler: WorkflowStepsHandler): void {
    this.handler = handler;
  }

  async getCompiledSteps(subjectType: ApprovalSubjectType): Promise<CompiledApprovalStep[] | null> {
    if (!this.handler) return null;
    return this.handler.getCompiledSteps(subjectType);
  }
}
