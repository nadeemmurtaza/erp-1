import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { TaskService } from './task.service';
import { TaskStageService } from './task-stage.service';
import { AssignTaskDto, CloseTaskDto, CreateTaskDto, CreateTaskStageDto, ReorderTaskStageDto, TransitionTaskDto } from './dto/task.dto';

/**
 * tasks-notifications-support/23-tasks-allotment-tracking.md.
 *
 * Route order matters: the fixed segments ('my', 'post/:positionId',
 * 'reports/:positionId/unclaimed') are declared before the generic ':id',
 * or Nest would match "/admin/tasks/my" to the :id handler first.
 */
@ApiTags('admin/tasks')
@Controller('admin/tasks')
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get('my')
  @AuthenticatedOnly()
  @ApiOperation({ summary: 'Tasks currently assigned to me' })
  myTasks(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.myTasks(user.id);
  }

  @Get('post/:positionId')
  @RequirePermission('tasks.view')
  @ApiOperation({ summary: 'Every task at a post — the post queue' })
  postQueue(@Param('positionId') positionId: string, @Query('includeClosed') includeClosed?: string) {
    return this.tasks.postQueue(positionId, includeClosed === 'true');
  }

  @Get('reports/:positionId/unclaimed')
  @RequirePermission('tasks.view')
  @ApiOperation({ summary: "Unclaimed open tasks at every post reporting to this one — the leaver-handling screen (WO-23.4)" })
  unclaimedForReports(@Param('positionId') positionId: string) {
    return this.tasks.unclaimedForReports(positionId);
  }

  @Get(':id')
  @RequirePermission('tasks.view')
  @ApiOperation({ summary: 'One task, with its full transition history' })
  get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  @Post()
  @RequirePermission('tasks.assign')
  @ApiOperation({ summary: 'Create a task at a post' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.create(
      { title: dto.title, detail: dto.detail, positionId: dto.positionId, priority: dto.priority, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined },
      user.id,
    );
  }

  @Post(':id/assign')
  @RequirePermission('tasks.assign')
  @ApiOperation({ summary: 'Assign a task to a person, or clear it (null) to unclaim' })
  assign(@Param('id') id: string, @Body() dto: AssignTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.assign(id, dto.assigneeUserId ?? null, user.id);
  }

  @Post(':id/transition')
  @RequirePermission('tasks.assign')
  @ApiOperation({ summary: 'Move a task between OPEN/IN_PROGRESS/BLOCKED, or change its stage. Use /close to reach DONE or CANCELLED.' })
  transition(@Param('id') id: string, @Body() dto: TransitionTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.transition(id, dto.to, user.id, { toStageId: dto.stageId, reason: dto.reason });
  }

  @Post(':id/close')
  @RequirePermission('tasks.close')
  @ApiOperation({ summary: 'Mark a task DONE or CANCELLED' })
  close(@Param('id') id: string, @Body() dto: CloseTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.close(id, dto.to, user.id, dto.reason);
  }
}

/** WO-23.5 — stage definitions, gated `tasks.admin` for writes; reading the list needs only `tasks.view` (it populates the create-task stage picker). */
@ApiTags('admin/tasks')
@Controller('admin/tasks/stages')
export class TaskStagesController {
  constructor(private readonly stages: TaskStageService) {}

  @Get()
  @RequirePermission('tasks.view', 'tasks.admin')
  @ApiOperation({ summary: 'Every workflow stage, in order' })
  list() {
    return this.stages.list();
  }

  @Post()
  @RequirePermission('tasks.admin')
  @ApiOperation({ summary: 'Add a stage' })
  create(@Body() dto: CreateTaskStageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.stages.create(dto, user.id);
  }

  @Post(':id/reorder')
  @RequirePermission('tasks.admin')
  @ApiOperation({ summary: 'Reorder a stage — does not rewrite the history of tasks that already moved through it' })
  reorder(@Param('id') id: string, @Body() dto: ReorderTaskStageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.stages.reorder(id, dto.order, user.id);
  }
}
