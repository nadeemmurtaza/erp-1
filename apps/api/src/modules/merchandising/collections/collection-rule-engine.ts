import { BadRequestException } from '@nestjs/common';
import type { CollectionRule, CollectionRuleCondition } from '@newax/shared';
import type { Prisma } from '../../../core/prisma/client';

const PRODUCT_FIELDS: Record<CollectionRuleCondition['field'], string> = {
  kind: 'kind',
  season: 'season',
  fabric: 'fabric',
  categoryId: 'categoryId',
  brandId: 'brandId',
  tag: 'tags',
  price: 'basePrice',
};

function conditionToWhere(condition: CollectionRuleCondition): Prisma.ProductWhereInput {
  const field = PRODUCT_FIELDS[condition.field];
  if (!field) throw new BadRequestException(`Unknown collection rule field: ${condition.field}`);

  if (condition.field === 'tag') {
    if (condition.operator === 'eq') return { tags: { has: String(condition.value) } };
    if (condition.operator === 'in') return { tags: { hasSome: (condition.value as string[]).map(String) } };
    throw new BadRequestException(`Operator "${condition.operator}" is not supported for field "tag"`);
  }

  switch (condition.operator) {
    case 'eq':
      return { [field]: condition.value } as Prisma.ProductWhereInput;
    case 'neq':
      return { [field]: { not: condition.value } } as Prisma.ProductWhereInput;
    case 'lt':
      return { [field]: { lt: condition.value } } as Prisma.ProductWhereInput;
    case 'lte':
      return { [field]: { lte: condition.value } } as Prisma.ProductWhereInput;
    case 'gt':
      return { [field]: { gt: condition.value } } as Prisma.ProductWhereInput;
    case 'gte':
      return { [field]: { gte: condition.value } } as Prisma.ProductWhereInput;
    case 'in':
      return { [field]: { in: condition.value as (string | number)[] } } as Prisma.ProductWhereInput;
    default:
      throw new BadRequestException(`Unknown collection rule operator: ${condition.operator}`);
  }
}

/**
 * WO-8.2 — "kind = UNSTITCHED and season = summer and price < 5000" (the
 * doc's own worked example) is exactly an `all` list of these conditions,
 * ANDed with the storefront's own always-ACTIVE requirement.
 */
export function ruleToProductWhere(rule: CollectionRule): Prisma.ProductWhereInput {
  if (!rule.all || rule.all.length === 0) {
    throw new BadRequestException('A collection rule needs at least one condition');
  }
  return { status: 'ACTIVE', AND: rule.all.map(conditionToWhere) };
}
