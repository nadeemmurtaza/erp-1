import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, RequirePermission } from '../../../core/auth/decorators';
import { ApprovalSubjectType } from '../../../core/prisma/client';
import { BpmnWorkflowsService } from './bpmn-workflows.service';
import { SaveBpmnWorkflowDto } from './dto/bpmn-workflow.dto';

/**
 * architecture-patterns/142-bpmn-visual-workflow-engine.md (WO-142.2/142.3).
 * Redrawing an approval chain's own shape is a settings-level decision
 * (`settings.bpmn-workflows.manage`) — it changes who approves what for
 * every future subject of this type. Reading an already-saved diagram is
 * open to any authenticated admin, so the editor can reopen it read-only
 * without a separate permission.
 */
@ApiTags('admin/bpmn-workflows')
@Controller('admin/bpmn-workflows')
export class BpmnWorkflowsController {
  constructor(private readonly workflows: BpmnWorkflowsService) {}

  @Get(':subjectType')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'The saved BPMN diagram (and its compiled steps) for one approval subject type, or null if none is defined' })
  get(@Param('subjectType') subjectType: string) {
    return this.workflows.getDefinition(this.assertKnownSubjectType(subjectType));
  }

  @Put(':subjectType')
  @RequirePermission('settings.bpmn-workflows.manage')
  @ApiOperation({ summary: 'Compile and save a BPMN diagram for one approval subject type' })
  save(@Param('subjectType') subjectType: string, @Body() dto: SaveBpmnWorkflowDto) {
    return this.workflows.saveDefinition(this.assertKnownSubjectType(subjectType), dto.diagramXml);
  }

  private assertKnownSubjectType(subjectType: string): ApprovalSubjectType {
    if (!(subjectType in ApprovalSubjectType)) {
      throw new BadRequestException(`"${subjectType}" is not a known approval subject type.`);
    }
    return subjectType as ApprovalSubjectType;
  }
}
