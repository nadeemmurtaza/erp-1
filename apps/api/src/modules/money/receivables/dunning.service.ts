import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { DunningPolicy } from '../../../core/prisma/client';
import { SetDunningPolicyDto } from './dto/receivables.dto';

export interface DunningStep {
  daysOverdue: number;
  templateKey: string;
}

/**
 * 145-receivables-credit-limits-dunning.md (WO-145.4) — "rows over enums":
 * a client-editable policy row rather than a hardcoded sequence. One row
 * per deployment today (findFirst/upsert, not a unique constraint — see
 * receivables.prisma's own comment on why that stays a service-layer rule).
 */
@Injectable()
export class DunningService {
  constructor(private readonly prisma: PrismaService) {}

  async getPolicy(): Promise<DunningPolicy | null> {
    return this.prisma.dunningPolicy.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  async getSteps(): Promise<DunningStep[]> {
    const policy = await this.getPolicy();
    const steps = (policy?.stepsJson as DunningStep[] | undefined) ?? [];
    return [...steps].sort((a, b) => a.daysOverdue - b.daysOverdue);
  }

  async setPolicy(dto: SetDunningPolicyDto): Promise<DunningPolicy> {
    const steps: Prisma.InputJsonValue = [...dto.steps]
      .sort((a, b) => a.daysOverdue - b.daysOverdue)
      .map((step) => ({ daysOverdue: step.daysOverdue, templateKey: step.templateKey }));
    const existing = await this.getPolicy();
    if (existing) {
      return this.prisma.dunningPolicy.update({ where: { id: existing.id }, data: { stepsJson: steps } });
    }
    return this.prisma.dunningPolicy.create({ data: { stepsJson: steps } });
  }

  async listEvents(orderId?: string) {
    if (!orderId) throw new NotFoundException('An orderId is required to list dunning events.');
    return this.prisma.dunningEvent.findMany({ where: { orderId }, orderBy: { stepIndex: 'asc' } });
  }
}
