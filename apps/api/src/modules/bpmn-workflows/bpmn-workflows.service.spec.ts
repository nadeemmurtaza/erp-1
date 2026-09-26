import { BadRequestException } from '@nestjs/common';
import { BpmnWorkflowsService } from './bpmn-workflows.service';
import { WorkflowStepsRegistry } from '../../core/extension-points/workflow-steps.registry';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    bpmnWorkflowDefinition: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      ...(overrides.bpmnWorkflowDefinition as Record<string, unknown> | undefined),
    },
  } as any;
}

const LINEAR_ONE_STEP = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:userTask id="Task_1" name="purchasing.requisitions.approve" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe('BpmnWorkflowsService — WO-142.3', () => {
  it('registers itself with WorkflowStepsRegistry on module init', () => {
    const registry = new WorkflowStepsRegistry();
    const service = new BpmnWorkflowsService(makePrisma(), registry);

    service.onModuleInit();

    return expect(registry.getCompiledSteps('PURCHASE_REQUISITION')).resolves.toBeNull();
  });

  it('returns null from the registry when no definition is saved for a subject type', async () => {
    const prisma = makePrisma();
    const registry = new WorkflowStepsRegistry();
    const service = new BpmnWorkflowsService(prisma, registry);
    service.onModuleInit();

    await expect(registry.getCompiledSteps('PURCHASE_REQUISITION')).resolves.toBeNull();
  });

  it('compiles and stores a diagram, then serves its compiled steps through the registry', async () => {
    const prisma = makePrisma();
    prisma.bpmnWorkflowDefinition.upsert.mockResolvedValue({ subjectType: 'PURCHASE_REQUISITION', diagramXml: LINEAR_ONE_STEP });
    prisma.bpmnWorkflowDefinition.findUnique.mockResolvedValue({ compiledSteps: [{ stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve' }] });
    const registry = new WorkflowStepsRegistry();
    const service = new BpmnWorkflowsService(prisma, registry);
    service.onModuleInit();

    await service.saveDefinition('PURCHASE_REQUISITION', LINEAR_ONE_STEP);

    expect(prisma.bpmnWorkflowDefinition.upsert).toHaveBeenCalledWith({
      where: { subjectType: 'PURCHASE_REQUISITION' },
      create: { subjectType: 'PURCHASE_REQUISITION', diagramXml: LINEAR_ONE_STEP, compiledSteps: [{ stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve' }] },
      update: { diagramXml: LINEAR_ONE_STEP, compiledSteps: [{ stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve' }] },
    });

    await expect(registry.getCompiledSteps('PURCHASE_REQUISITION')).resolves.toEqual([{ stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve' }]);
  });

  it('rejects saving a diagram with an unsupported construct before ever writing to Prisma', async () => {
    const prisma = makePrisma();
    const registry = new WorkflowStepsRegistry();
    const service = new BpmnWorkflowsService(prisma, registry);

    const withGateway = `<bpmn:definitions xmlns:bpmn="x"><bpmn:process id="P"><bpmn:exclusiveGateway id="G" /></bpmn:process></bpmn:definitions>`;
    await expect(service.saveDefinition('PURCHASE_REQUISITION', withGateway)).rejects.toThrow(BadRequestException);
    expect(prisma.bpmnWorkflowDefinition.upsert).not.toHaveBeenCalled();
  });
});
