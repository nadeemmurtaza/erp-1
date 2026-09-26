import { Global, INestApplication, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { TaskSourceRegistry } from '../../core/extension-points/task-source.registry';
import { TasksModule } from './tasks.module';
import { TaskService } from './task.service';

/**
 * `PrismaService`/`AuditService`/`TaskSourceRegistry`/`EventEmitter2` are
 * `@Global()` (or global-equivalent) providers in the real app
 * (core.module.ts / extension-points.module.ts / events.module.ts) — this
 * stand-in reproduces exactly that shape for an isolated test, rather than
 * importing the real global modules (which would drag in a live outbox
 * poller and the AI/replication providers those modules also wire up).
 */
@Global()
@Module({
  providers: [
    PrismaService,
    AuditService,
    TaskSourceRegistry,
    { provide: EventEmitter2, useValue: { onAny: jest.fn(), emitAsync: jest.fn() } },
  ],
  exports: [PrismaService, AuditService, TaskSourceRegistry, EventEmitter2],
})
class TestGlobalsModule {}

/**
 * The pack-absence acceptance criterion, at the DI level: "A module raising
 * tasks can be removed from MODULES and the task module still boots."
 * `TasksModule` is compiled here on its OWN, importing nothing from
 * `purchasing`, `hr` or `orgstructure` — if it depended on any of them by
 * TypeScript import (rather than a Prisma-schema relation and
 * TaskSourceRegistry/PostingEnded, both core), this module would fail to
 * resolve without them present, exactly the failure this test would catch.
 */
describe('TasksModule — pack-absence', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('boots with no other feature module present', async () => {
    moduleRef = await Test.createTestingModule({ imports: [TestGlobalsModule, TasksModule] }).compile();

    app = moduleRef.createNestApplication();
    await expect(app.init()).resolves.toBeDefined();

    expect(moduleRef.get(TaskService)).toBeInstanceOf(TaskService);
    // No mapping was ever registered — the demonstration registration lives
    // in purchasing.module.ts, absent here on purpose.
    expect(moduleRef.get(TaskSourceRegistry).mappingFor('purchasing.requisition_created')).toBeUndefined();
  }, 30_000);
});
