import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { WorkflowStepsRegistry, type CompiledApprovalStep } from '../../../core/extension-points/workflow-steps.registry';
import type { ApprovalSubjectType, BpmnWorkflowDefinition, Prisma } from '../../../core/prisma/client';
import { compileBpmnToApprovalSteps } from './bpmn-compiler';

/**
 * architecture-patterns/142-bpmn-visual-workflow-engine.md (WO-142.3). The
 * BPMN diagram is a visual editor for `ApprovalChain`'s own existing data
 * model, never a second execution runtime (§1) — this service compiles a
 * diagram at SAVE time and registers itself with `WorkflowStepsRegistry` so
 * a subject module can read the compiled result; no BPMN interpreter ever
 * runs against a live approval decision.
 */
@Injectable()
export class BpmnWorkflowsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowSteps: WorkflowStepsRegistry,
  ) {}

  onModuleInit(): void {
    this.workflowSteps.register({
      getCompiledSteps: (subjectType) => this.getCompiledSteps(subjectType),
    });
  }

  getDefinition(subjectType: ApprovalSubjectType): Promise<BpmnWorkflowDefinition | null> {
    return this.prisma.bpmnWorkflowDefinition.findUnique({ where: { subjectType } });
  }

  /**
   * Round-trip editing (WO-142.3's own requirement): `diagramXml` is stored
   * alongside its compiled output, so a manager reopening the editor sees
   * their own last-saved shape, never a lossy re-derivation from the
   * compiled rows.
   */
  async saveDefinition(subjectType: ApprovalSubjectType, diagramXml: string): Promise<BpmnWorkflowDefinition> {
    const compiledSteps = compileBpmnToApprovalSteps(diagramXml);
    return this.prisma.bpmnWorkflowDefinition.upsert({
      where: { subjectType },
      create: { subjectType, diagramXml, compiledSteps: compiledSteps as unknown as Prisma.InputJsonValue },
      update: { diagramXml, compiledSteps: compiledSteps as unknown as Prisma.InputJsonValue },
    });
  }

  private async getCompiledSteps(subjectType: ApprovalSubjectType): Promise<CompiledApprovalStep[] | null> {
    const definition = await this.prisma.bpmnWorkflowDefinition.findUnique({ where: { subjectType } });
    return (definition?.compiledSteps as unknown as CompiledApprovalStep[] | undefined) ?? null;
  }
}
