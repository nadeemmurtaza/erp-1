import { BadRequestException } from '@nestjs/common';
import type { CompiledApprovalStep } from '../../../core/extension-points/workflow-steps.registry';

/**
 * architecture-patterns/142-bpmn-visual-workflow-engine.md (WO-142.1).
 *
 * Parses ONLY the supported BPMN subset this repository executes: a
 * strictly linear sequence of approval task nodes between a start and an
 * end event. Any other BPMN element (a gateway of any kind, a timer or
 * message event, a script/service task, a sub-process) is REJECTED here,
 * never silently ignored and never executed by a second interpreter this
 * repository does not build — `ApprovalService.decide()` remains the ONLY
 * thing that ever executes a step (doc 63).
 *
 * "Simple branching" in doc 142's own text is narrowed, deliberately, to
 * strictly linear: a real approve/reject branch already exists inside
 * `ApprovalService.decide()` itself (a REJECT skips every remaining step
 * automatically), so a workflow author never needs a visual gateway to
 * express it — supporting one would mean building the exact second
 * interpreter this document's own §1 refuses to become.
 *
 * A pure function: no Prisma, no event publish, no I/O. Deterministic on
 * its input, so it can replay safely and be unit-tested directly.
 */
export function compileBpmnToApprovalSteps(diagramXml: string): CompiledApprovalStep[] {
  const processMatch = /<(?:\w+:)?process\b[^>]*>([\s\S]*?)<\/(?:\w+:)?process>/.exec(diagramXml);
  if (!processMatch) {
    throw new BadRequestException('Not a valid BPMN diagram: no <process> element found.');
  }
  const processBody = processMatch[1];

  const ALLOWED_TAGS = new Set(['process', 'startEvent', 'endEvent', 'sequenceFlow', 'task', 'userTask', 'extensionElements', 'documentation', 'incoming', 'outgoing']);
  const TASK_TAGS = new Set(['task', 'userTask']);

  const OPEN_TAG_PATTERN = /<(?:\w+:)?([A-Za-z][\w-]*)\b([^>]*?)\/?>/g;
  const tasks = new Map<string, { name: string | null }>();
  const flows: Array<{ sourceRef: string; targetRef: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = OPEN_TAG_PATTERN.exec(processBody))) {
    const [, tagName, attrs] = match;
    if (!ALLOWED_TAGS.has(tagName)) {
      throw new BadRequestException(
        `This workflow uses "${tagName}", which this repository's approval engine does not execute. Only a linear sequence of task nodes between a start and an end event is supported.`,
      );
    }
    if (TASK_TAGS.has(tagName)) {
      const id = attr(attrs, 'id');
      if (!id) throw new BadRequestException('An approval task node is missing its own id.');
      tasks.set(id, { name: attr(attrs, 'name') });
    } else if (tagName === 'sequenceFlow') {
      const sourceRef = attr(attrs, 'sourceRef');
      const targetRef = attr(attrs, 'targetRef');
      if (!sourceRef || !targetRef) throw new BadRequestException('A sequence flow is missing sourceRef or targetRef.');
      flows.push({ sourceRef, targetRef });
    }
  }

  if (tasks.size === 0) {
    throw new BadRequestException('A workflow needs at least one approval task.');
  }

  const order = orderTasks(tasks, flows);

  return order.map((id, index) => {
    const name = tasks.get(id)!.name?.trim();
    if (!name) {
      throw new BadRequestException(`Task "${id}" has no name — set it to the approver's permission key (e.g. "purchasing.requisitions.approve") or "user:<userId>".`);
    }
    const step: CompiledApprovalStep = name.startsWith('user:') ? { approverUserId: name.slice('user:'.length).trim() } : { approverRoleId: name };
    return { stepOrder: index + 1, ...step };
  });
}

/** Walks task-to-task sequence flows into a single linear order, or rejects if the shape isn't strictly linear. */
function orderTasks(tasks: Map<string, { name: string | null }>, flows: Array<{ sourceRef: string; targetRef: string }>): string[] {
  const taskToTaskFlows = flows.filter((flow) => tasks.has(flow.sourceRef) && tasks.has(flow.targetRef));

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const flow of taskToTaskFlows) {
    outgoing.set(flow.sourceRef, [...(outgoing.get(flow.sourceRef) ?? []), flow.targetRef]);
    incoming.set(flow.targetRef, [...(incoming.get(flow.targetRef) ?? []), flow.sourceRef]);
  }

  for (const id of tasks.keys()) {
    if ((outgoing.get(id)?.length ?? 0) > 1 || (incoming.get(id)?.length ?? 0) > 1) {
      throw new BadRequestException(`Task "${id}" branches to or from more than one other task — only a strictly linear sequence is supported, since a gateway is not.`);
    }
  }

  const starts = [...tasks.keys()].filter((id) => (incoming.get(id)?.length ?? 0) === 0);
  if (starts.length !== 1) {
    throw new BadRequestException('Could not find a single starting approval task — every task but the first must have exactly one predecessor task.');
  }

  // With every node's in/out-degree already capped at 1 and exactly one
  // node at in-degree 0, this walk cannot revisit a node — a return to any
  // node would require a second incoming edge into it, already excluded
  // above. A node this walk never reaches (a disconnected task, or an
  // isolated cycle with no in-degree-0 node of its own) is caught below.
  const order: string[] = [];
  let current: string | undefined = starts[0];
  while (current) {
    order.push(current);
    current = outgoing.get(current)?.[0];
  }

  if (order.length !== tasks.size) {
    throw new BadRequestException('This workflow has approval tasks that are not connected into the single linear sequence — every task must be reachable from the first.');
  }

  return order;
}

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return match ? match[1] : null;
}
