import { Injectable } from '@nestjs/common';
import type { DomainEventName } from '../events/domain-events';

/** What a registered event turns into, once its mapping resolves it. */
export interface TaskSourceCreateInput {
  title: string;
  detail?: string | null;
  /** The durable post the resulting task is assigned to (Task.positionId, required). */
  positionId: string;
  sourceType: string;
  sourceId: string;
  /** Idempotency key — `Task.@@unique([sourceType, sourceRef])` makes a redelivered event a no-op. */
  sourceRef: string;
  priority?: number;
  dueAt?: Date | null;
}

export interface TaskSourceMapping<TPayload = unknown> {
  eventName: DomainEventName;
  /**
   * Turns the event payload into task-creation input, or returns null/undefined
   * to skip this occurrence — e.g. the module that would receive the task
   * (hr/orgstructure) has no Position to route it to, the "absent
   * collaborator" case doc 23's own scope lenses name. May be async: a
   * mapping typically needs a Prisma read (e.g. the requester's own open
   * posting) to resolve a positionId — the same "cross-schema read, no
   * TypeScript coupling" pattern GrantService already establishes
   * (DECISIONS.md ADR-045).
   */
  toTask(payload: TPayload): Promise<TaskSourceCreateInput | null> | TaskSourceCreateInput | null;
}

/**
 * Lets any module turn one of its own domain events into a Task, without
 * `tasks` importing that module and without that module importing `tasks`
 * (tasks-notifications-support/23-tasks-allotment-tracking.md, WO-23.3).
 *
 * The core-internal counterpart to StockIntakeRegistry/EmployeeOffboardingRegistry
 * (same file convention, same reasoning) — except the direction is reversed:
 * there, `hr`/`inventory` register a HANDLER other modules call INTO. Here,
 * any number of producer modules register a MAPPING, and `tasks`' own
 * generic subscriber (TaskEventIntakeService) is the single place that
 * reads them, on every domain event this deployment fires. A deployment
 * that excludes a producer module from MODULES simply never registers a
 * mapping for its own events — the generic subscriber then never matches
 * them, exactly the "absent collaborator" shape every other registry in
 * this file already gives a switched-off module. Register from the
 * producer module's own `onModuleInit()`.
 */
@Injectable()
export class TaskSourceRegistry {
  private readonly mappings = new Map<DomainEventName, TaskSourceMapping>();

  register(mapping: TaskSourceMapping): void {
    this.mappings.set(mapping.eventName, mapping);
  }

  /** Undefined when no module registered a mapping for this event name. */
  mappingFor(eventName: string): TaskSourceMapping | undefined {
    return this.mappings.get(eventName as DomainEventName);
  }
}
