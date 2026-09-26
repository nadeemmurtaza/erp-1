import { Module } from '@nestjs/common';
import { BpmnWorkflowsController } from './bpmn-workflows.controller';
import { BpmnWorkflowsService } from './bpmn-workflows.service';

/**
 * architecture-patterns/142-bpmn-visual-workflow-engine.md — a BPMN visual
 * workflow engine, built by explicit owner override (ADR-026). Always on,
 * like `custom-fields`/`entity-attributes`: infrastructure, not a
 * sector-specific pack. Reaches `purchasing`'s `RequisitionService` only
 * through `WorkflowStepsRegistry` (an extension point), never a direct
 * import either direction.
 */
@Module({
  controllers: [BpmnWorkflowsController],
  providers: [BpmnWorkflowsService],
  exports: [BpmnWorkflowsService],
})
export class BpmnWorkflowsModule {}
