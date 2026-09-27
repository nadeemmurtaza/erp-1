import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface EscalationRuleInput {
  sourceType: string;
  afterMinutes: number;
  stepsPerFire?: number;
  ceilingRankLevel?: number | null;
  maxFires?: number;
}

export interface EscalationRuleUpdate {
  afterMinutes?: number;
  stepsPerFire?: number;
  ceilingRankLevel?: number | null;
  maxFires?: number;
}

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.4/24.5) — admin configuration for the escalation timer
 * `EscalationCron` runs. `sourceType` is the same (type, id) key
 * `Task.sourceType` carries, matched by the cron each tick.
 */
@Injectable()
export class EscalationRuleService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.escalationRule.findMany({ orderBy: { sourceType: 'asc' } });
  }

  async create(input: EscalationRuleInput) {
    const existing = await this.prisma.escalationRule.findUnique({ where: { sourceType: input.sourceType } });
    if (existing) throw new ConflictException(`An escalation rule already exists for source type "${input.sourceType}".`);

    return this.prisma.escalationRule.create({
      data: {
        sourceType: input.sourceType,
        afterMinutes: input.afterMinutes,
        stepsPerFire: input.stepsPerFire ?? 1,
        ceilingRankLevel: input.ceilingRankLevel ?? null,
        maxFires: input.maxFires ?? 3,
      },
    });
  }

  async update(id: string, input: EscalationRuleUpdate) {
    const existing = await this.prisma.escalationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Escalation rule not found.');

    return this.prisma.escalationRule.update({
      where: { id },
      data: {
        afterMinutes: input.afterMinutes,
        stepsPerFire: input.stepsPerFire,
        ceilingRankLevel: input.ceilingRankLevel,
        maxFires: input.maxFires,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.escalationRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Escalation rule not found.');
    await this.prisma.escalationRule.delete({ where: { id } });
  }
}
