import { BadRequestException } from '@nestjs/common';
import type { SegmentFilter, SegmentFilterCondition } from '@newax/shared';
import type { Prisma } from '../prisma/client';

const SCALAR_FIELDS: Record<string, string> = {
  orderCount: 'orderCount',
  lifetimeValue: 'lifetimeValue',
  avgOrderValue: 'avgOrderValue',
  rfmRecencyScore: 'rfmRecencyScore',
  rfmFrequencyScore: 'rfmFrequencyScore',
  rfmMonetaryScore: 'rfmMonetaryScore',
};

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60_000);
}

function conditionToWhere(condition: SegmentFilterCondition): Prisma.ContactWhereInput {
  if (condition.field === 'city') {
    if (condition.operator === 'eq') return { city: { equals: String(condition.value), mode: 'insensitive' } };
    if (condition.operator === 'in') return { city: { in: (condition.value as string[]).map(String), mode: 'insensitive' } };
    throw new BadRequestException(`Operator "${condition.operator}" is not supported for field "city"`);
  }

  if (condition.field === 'tag') {
    const names = condition.operator === 'in' ? (condition.value as string[]).map(String) : [String(condition.value)];
    if (condition.operator !== 'eq' && condition.operator !== 'in') {
      throw new BadRequestException(`Operator "${condition.operator}" is not supported for field "tag"`);
    }
    return { tags: { some: { tag: { name: { in: names } } } } };
  }

  if (condition.field === 'lastOrderDaysAgo') {
    const cutoff = daysAgo(Number(condition.value));
    // "days ago" is inverted against a calendar date: fewer days ago means a
    // MORE RECENT date, i.e. lastOrderAt >= cutoff.
    switch (condition.operator) {
      case 'lt':
      case 'lte':
        return { lastOrderAt: { gte: cutoff } };
      case 'gt':
      case 'gte':
        return { lastOrderAt: { lte: cutoff } };
      default:
        throw new BadRequestException(`Operator "${condition.operator}" is not supported for field "lastOrderDaysAgo"`);
    }
  }

  const field = SCALAR_FIELDS[condition.field];
  if (!field) throw new BadRequestException(`Unknown segment filter field: ${condition.field}`);

  switch (condition.operator) {
    case 'eq':
      return { [field]: condition.value } as Prisma.ContactWhereInput;
    case 'neq':
      return { [field]: { not: condition.value } } as Prisma.ContactWhereInput;
    case 'lt':
      return { [field]: { lt: condition.value } } as Prisma.ContactWhereInput;
    case 'lte':
      return { [field]: { lte: condition.value } } as Prisma.ContactWhereInput;
    case 'gt':
      return { [field]: { gt: condition.value } } as Prisma.ContactWhereInput;
    case 'gte':
      return { [field]: { gte: condition.value } } as Prisma.ContactWhereInput;
    case 'in':
      return { [field]: { in: condition.value as unknown as number[] } } as Prisma.ContactWhereInput;
    default:
      throw new BadRequestException(`Unknown segment filter operator: ${condition.operator}`);
  }
}

/**
 * WO-8.4 — Segment.filter shipped with the CRM (crm.prisma) with nothing
 * that ever evaluated it: no service, no controller, no UI. This is that
 * evaluator, built because campaign audiences are the first real consumer.
 * "Repeat buyers in Lahore" (the doc's own example) is exactly
 * `{ all: [{field:'orderCount', operator:'gte', value:2},
 *          {field:'city', operator:'eq', value:'Lahore'}] }`.
 *
 * Lives in core, not in crm/, on purpose: crm's own SegmentsService uses it
 * (CRUD, preview-count) and marketing's CampaignsService needs the exact
 * same evaluation to resolve a campaign's audience. Neither module may
 * import the other's non-.service/.module files (and this is a read, not
 * the same-transaction write KNOWN_MODULE_COUPLINGS exists for), so this
 * sits beside PrismaService and the other cross-cutting core utilities
 * instead of being duplicated in both.
 */
export function segmentFilterToWhere(filter: SegmentFilter): Prisma.ContactWhereInput {
  if (!filter.all || filter.all.length === 0) {
    throw new BadRequestException('A segment filter needs at least one condition');
  }
  return { AND: filter.all.map(conditionToWhere) };
}
