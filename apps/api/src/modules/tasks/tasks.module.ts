import { Module } from '@nestjs/common';
import { TasksController, TaskStagesController } from './task.controller';
import { TaskService } from './task.service';
import { TaskStageService } from './task-stage.service';
import { TaskEventIntakeService } from './task-event-intake.service';
import { TaskLeaverListener } from './task-leaver.listener';

/**
 * tasks-notifications-support/23-tasks-allotment-tracking.md (DECISIONS.md
 * ADR-049). Imports no other feature module — it reaches `Position` only
 * through a Prisma-schema relation (Task.position, same pack, no
 * TypeScript coupling — the identical pattern hr.module.ts's own header
 * comment already documents for Position -> OrgUnit) and reacts to other
 * modules' domain events only through TaskSourceRegistry
 * (core/extension-points/task-source.registry.ts, WO-23.3) and hr's own
 * PostingEnded event (WO-23.4). No other module imports `tasks` either —
 * see `check-module-boundaries.mjs`.
 *
 * `TaskEventIntakeService` and `TaskLeaverListener` have no other injector
 * in this module — like `OutboxDispatcher`/`PurchasingCron` elsewhere in
 * this codebase, they are self-initialising providers Nest still boots and
 * runs their lifecycle hooks on as long as they are listed here.
 */
@Module({
  controllers: [TasksController, TaskStagesController],
  providers: [TaskService, TaskStageService, TaskEventIntakeService, TaskLeaverListener],
  exports: [TaskService],
})
export class TasksModule {}
