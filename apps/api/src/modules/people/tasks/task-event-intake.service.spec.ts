import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskSourceRegistry } from '../../../core/extension-points/task-source.registry';
import { TaskService } from './task.service';
import { TaskEventIntakeService } from './task-event-intake.service';

/**
 * WO-23.3 — the generic event-intake subscriber. `handle()` is exercised
 * directly rather than through a real EventEmitter2 `emitAsync()` round
 * trip: `onModuleInit()`'s only job is to register the ONE `onAny()`
 * listener (proven separately below), and the actual routing logic is a
 * plain method, simplest tested as one.
 */
describe('TaskEventIntakeService', () => {
  let service: TaskEventIntakeService;
  let registry: any;
  let tasks: any;
  let emitter: any;

  beforeEach(async () => {
    registry = { mappingFor: jest.fn() };
    tasks = { createFromSource: jest.fn() };
    emitter = { onAny: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskEventIntakeService,
        { provide: EventEmitter2, useValue: emitter },
        { provide: TaskSourceRegistry, useValue: registry },
        { provide: TaskService, useValue: tasks },
      ],
    }).compile();

    service = module.get(TaskEventIntakeService);
  });

  it('onModuleInit registers exactly one onAny() listener', () => {
    service.onModuleInit();
    expect(emitter.onAny).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an event no producer module registered — the pack-absence case: a module raising tasks can be removed from MODULES and the task module still boots and simply never matches its event', async () => {
    registry.mappingFor.mockReturnValue(undefined);
    await (service as any).handle('some.unregistered.event', { anything: true });
    expect(tasks.createFromSource).not.toHaveBeenCalled();
  });

  it('does nothing when the mapping itself decides to skip (e.g. no Position to route to)', async () => {
    const toTask = jest.fn().mockResolvedValue(null);
    registry.mappingFor.mockReturnValue({ eventName: 'purchasing.requisition_created', toTask });
    await (service as any).handle('purchasing.requisition_created', { requisitionId: 'r1' });
    expect(toTask).toHaveBeenCalledWith({ requisitionId: 'r1' });
    expect(tasks.createFromSource).not.toHaveBeenCalled();
  });

  it('creates a task when a mapping resolves one', async () => {
    const input = { title: 'Review it', positionId: 'pos1', sourceType: 'purchasing', sourceId: 'r1', sourceRef: 'r1' };
    registry.mappingFor.mockReturnValue({ eventName: 'purchasing.requisition_created', toTask: jest.fn().mockResolvedValue(input) });
    await (service as any).handle('purchasing.requisition_created', { requisitionId: 'r1' });
    expect(tasks.createFromSource).toHaveBeenCalledWith(input);
  });

  it('a redelivered event calls createFromSource() again, but idempotency is TaskService\'s own job (proven in task.service.spec.ts) — this subscriber calls it exactly once per delivery, not once per redelivery attempt it itself tracks', async () => {
    const input = { title: 'Review it', positionId: 'pos1', sourceType: 'purchasing', sourceId: 'r1', sourceRef: 'r1' };
    const mapping = { eventName: 'purchasing.requisition_created', toTask: jest.fn().mockResolvedValue(input) };
    registry.mappingFor.mockReturnValue(mapping);

    await (service as any).handle('purchasing.requisition_created', { requisitionId: 'r1' });
    await (service as any).handle('purchasing.requisition_created', { requisitionId: 'r1' }); // the outbox redelivering the same event

    expect(tasks.createFromSource).toHaveBeenCalledTimes(2);
    expect(tasks.createFromSource).toHaveBeenNthCalledWith(1, input);
    expect(tasks.createFromSource).toHaveBeenNthCalledWith(2, input);
  });

  it('ignores a wildcard-mode event tuple (string[]) — this process never emits one, but the type guard must not throw', async () => {
    await (service as any).handle(['a', 'b'], {});
    expect(registry.mappingFor).not.toHaveBeenCalled();
  });
});
