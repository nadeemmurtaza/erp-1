/**
 * The rule shape `Collection.rule` (catalog.prisma, WO-8.2) holds when a
 * collection is rule-based rather than manually curated. Business rules are
 * data (House Rule 4) — a merchandiser's "kind = UNSTITCHED and season =
 * summer and price < 5000" is exactly an `all` list of these conditions.
 */
export interface CollectionRuleCondition {
  field: 'kind' | 'season' | 'fabric' | 'categoryId' | 'brandId' | 'tag' | 'price';
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
  value: string | number | string[];
}

export interface CollectionRule {
  all: CollectionRuleCondition[];
}
