import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskSourceRegistry } from '../../core/extension-points/task-source.registry';
import { TaskService } from './task.service';

/**
 * The generic event-intake subscriber (WO-23.3): turns any domain event a
 * producer module registered with TaskSourceRegistry into a Task, without
 * `tasks` importing a single line of that module.
 *
 * Uses `EventEmitter2.onAny()` rather than a fixed `@OnDomainEvent(...)` per
 * event, because the whole point is not knowing the event names at compile
 * time — a new registration is a new file in the PRODUCER module, never an
 * edit here. `onAny()` fires for every event this process emits regardless
 * of the emitter's `wildcard` option (unlike `.on('a.*', …)`, which needs
 * it); EventBusService.dispatch() is the ONLY call site in this codebase
 * that ever calls `emitAsync()`, so this never sees anything but a real,
 * outbox-delivered domain event.
 *
 * Idempotent by construction: `TaskService.createFromSource()` reads
 * `(sourceType, sourceRef)` before writing and is a no-op on a redelivered
 * event (WO-23.3's own acceptance criterion). Rejecting here (a missing
 * mapping never throws) is what tells the OutboxDispatcher to retry — a
 * mapping that throws leaves its event PENDING/FAILED, in the same
 * durable-failure-path shape every other subscriber in this codebase uses.
 */
@Injectable()
export class TaskEventIntakeService implements OnModuleInit {
  private readonly logger = new Logger(TaskEventIntakeService.name);

  constructor(
    private readonly emitter: EventEmitter2,
    private readonly registry: TaskSourceRegistry,
    private readonly tasks: TaskService,
  ) {}

  onModuleInit(): void {
    this.emitter.onAny((event: string | string[], payload: unknown) => this.handle(event, payload));
  }

  private async handle(event: string | string[], payload: unknown): Promise<void> {
    // EventEmitter2's onAny() types an event name as string | string[] only
    // for wildcard mode (`{"a.b", "a.c"}` on a multi-match pattern) — this
    // process never enables wildcard listeners (events.module.ts), and
    // EventBusService.dispatch() always calls emitAsync() with a single
    // string name, so this is always a plain string in practice.
    if (Array.isArray(event)) return;
    const mapping = this.registry.mappingFor(event);
    if (!mapping) return; // no producer module registered a mapping for this event — nothing to do

    const input = await mapping.toTask(payload);
    if (!input) return; // the mapping itself decided to skip this occurrence (e.g. no Position to route to)

    await this.tasks.createFromSource(input);
    this.logger.debug(`created a task from "${event}" (source ${input.sourceType}:${input.sourceId})`);
  }
}
