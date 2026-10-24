import { BadRequestException } from '@nestjs/common';
import { compileBpmnToApprovalSteps } from './bpmn-compiler';

function diagram(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false">
    ${body}
  </bpmn:process>
</bpmn:definitions>`;
}

const LINEAR_TWO_STEP = diagram(`
  <bpmn:startEvent id="StartEvent_1" />
  <bpmn:userTask id="Task_1" name="purchasing.requisitions.approve" />
  <bpmn:userTask id="Task_2" name="user:user_42" />
  <bpmn:endEvent id="EndEvent_1" />
  <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
  <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
`);

describe('compileBpmnToApprovalSteps — WO-142.1', () => {
  it('compiles a linear two-step chain in order, resolving "user:" names to approverUserId', () => {
    expect(compileBpmnToApprovalSteps(LINEAR_TWO_STEP)).toEqual([
      { stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve' },
      { stepOrder: 2, approverUserId: 'user_42' },
    ]);
  });

  it('compiles a single-task chain', () => {
    const single = diagram(`
      <bpmn:startEvent id="StartEvent_1" />
      <bpmn:task id="Task_1" name="purchasing.requisitions.approve" />
      <bpmn:endEvent id="EndEvent_1" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
      <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
    `);
    expect(compileBpmnToApprovalSteps(single)).toEqual([{ stepOrder: 1, approverRoleId: 'purchasing.requisitions.approve' }]);
  });

  it('rejects a diagram with no <process> element', () => {
    expect(() => compileBpmnToApprovalSteps('<not-bpmn/>')).toThrow(BadRequestException);
  });

  it('rejects an unsupported construct (exclusiveGateway) by name', () => {
    const withGateway = diagram(`
      <bpmn:startEvent id="StartEvent_1" />
      <bpmn:exclusiveGateway id="Gateway_1" />
      <bpmn:userTask id="Task_1" name="purchasing.requisitions.approve" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Gateway_1" />
      <bpmn:sequenceFlow id="Flow_2" sourceRef="Gateway_1" targetRef="Task_1" />
    `);
    expect(() => compileBpmnToApprovalSteps(withGateway)).toThrow(/exclusiveGateway/);
  });

  it('rejects a timer event definition', () => {
    const withTimer = diagram(`
      <bpmn:startEvent id="StartEvent_1" />
      <bpmn:userTask id="Task_1" name="purchasing.requisitions.approve" />
      <bpmn:boundaryEvent id="Timer_1" attachedToRef="Task_1">
        <bpmn:timerEventDefinition />
      </bpmn:boundaryEvent>
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    `);
    expect(() => compileBpmnToApprovalSteps(withTimer)).toThrow(/boundaryEvent/);
  });

  it('rejects a task with no name', () => {
    const unnamed = diagram(`
      <bpmn:startEvent id="StartEvent_1" />
      <bpmn:userTask id="Task_1" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    `);
    expect(() => compileBpmnToApprovalSteps(unnamed)).toThrow(/has no name/);
  });

  it('rejects a workflow with no approval tasks at all', () => {
    const empty = diagram(`
      <bpmn:startEvent id="StartEvent_1" />
      <bpmn:endEvent id="EndEvent_1" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="EndEvent_1" />
    `);
    expect(() => compileBpmnToApprovalSteps(empty)).toThrow(/at least one approval task/);
  });

  it('rejects a task branching to two other tasks (no gateway)', () => {
    const branching = diagram(`
      <bpmn:startEvent id="StartEvent_1" />
      <bpmn:userTask id="Task_1" name="a" />
      <bpmn:userTask id="Task_2" name="b" />
      <bpmn:userTask id="Task_3" name="c" />
      <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
      <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
      <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_1" targetRef="Task_3" />
    `);
    expect(() => compileBpmnToApprovalSteps(branching)).toThrow(/branches to or from more than one/);
  });

  it('rejects two disconnected task chains with no single starting task', () => {
    const disconnected = diagram(`
      <bpmn:userTask id="Task_1" name="a" />
      <bpmn:userTask id="Task_2" name="b" />
    `);
    expect(() => compileBpmnToApprovalSteps(disconnected)).toThrow(BadRequestException);
  });
});
