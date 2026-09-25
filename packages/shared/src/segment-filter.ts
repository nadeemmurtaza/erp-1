/**
 * The filter shape `Segment.filter` (crm.prisma) holds. `Segment` shipped
 * with the CRM as a `Json` filter column and nothing that ever evaluated it
 * — no service, no controller, no UI (confirmed empty before WO-8.4). This
 * is the shape SegmentsService.resolveMembers() (apps/api/src/modules/crm)
 * actually evaluates, built now because Phase 8's campaign audiences are the
 * first real consumer.
 *
 * All conditions AND together — the doc's own worked example, "repeat
 * buyers in Lahore", is exactly `{ all: [{field:'orderCount', operator:
 * 'gte', value: 2}, {field:'city', operator:'eq', value:'Lahore'}] }`.
 */
export interface SegmentFilterCondition {
  field:
    | 'orderCount'
    | 'lifetimeValue'
    | 'avgOrderValue'
    | 'lastOrderDaysAgo'
    | 'city'
    | 'tag'
    | 'rfmRecencyScore'
    | 'rfmFrequencyScore'
    | 'rfmMonetaryScore';
  operator: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in';
  value: string | number | string[];
}

export interface SegmentFilter {
  all: SegmentFilterCondition[];
}
