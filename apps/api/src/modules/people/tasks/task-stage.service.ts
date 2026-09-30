import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../../core/audit/audit.service';
import type { TaskStageDefinition } from '../../../core/prisma/client';

/**
 * TaskStageDefinition CRUD — WO-23.1's own "stage definitions seeded empty":
 * a client adds a stage through this service (gated by `tasks.admin`) via
 * the admin UI, never a migration. Reordering does not rewrite history —
 * TaskTransition stores the stage id it moved to, not its label or order at
 * the time (doc 23, "The version stamp").
 */
@Injectable()
export class TaskStageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TaskStageDefinition[]> {
    return this.prisma.taskStageDefinition.findMany({ orderBy: { order: 'asc' } });
  }

  async create(input: { key: string; label: string; order?: number }, actorId: string): Promise<TaskStageDefinition> {
    const key = cleanRequired(input.key, 'a key');
    const label = cleanRequired(input.label, 'a label');
    const clash = await this.prisma.taskStageDefinition.findUnique({ where: { key } });
    if (clash) throw new ConflictException('A stage with that key already exists.');

    const order = input.order ?? (await this.nextOrder());

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.taskStageDefinition.create({ data: { key, label, order } });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'task_stage.created',
        entity: 'TaskStageDefinition',
        entityId: row.id,
        data: { key, label, order },
      });
      return row;
    });
  }

  async reorder(id: string, order: number, actorId: string): Promise<TaskStageDefinition> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.taskStageDefinition.update({ where: { id }, data: { order } });
      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'task_stage.reordered',
        entity: 'TaskStageDefinition',
        entityId: id,
        data: { order },
      });
      return row;
    });
  }

  private async nextOrder(): Promise<number> {
    const max = await this.prisma.taskStageDefinition.aggregate({ _max: { order: true } });
    return (max._max.order ?? 0) + 10;
  }
}

function cleanRequired(raw: string, what: string): string {
  const value = raw.trim();
  if (!value) throw new BadRequestException(`Enter ${what}.`);
  return value;
}
