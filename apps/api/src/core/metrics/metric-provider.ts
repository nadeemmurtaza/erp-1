import type { PermissionKey } from '@newax/shared';

/**
 * The extension point that lets any module contribute a dashboard number
 * without `analytics` importing it (10-admin-dashboard.md D2, WO-A.3).
 * Mirrors `core/extension-points/stock-intake.registry.ts`'s own shape: a
 * `@Global` registry service, and each owning module registers into it from
 * its own `onModuleInit()` — never the other way around.
 */

/** The window a batch of metrics is computed over, plus the caller's own permission set. */
export interface MetricContext {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** The calling admin's held permission keys — never trusted from the client, always the resolved server-side set. */
  permissions: readonly PermissionKey[];
}

export type MetricUnit = 'paisa' | 'count' | 'bps' | 'days';

export interface MetricValue {
  value: number;
  /** The same metric over `MetricContext.prevFrom`..`prevTo` — null when the provider has no comparable prior figure (a metric that only started existing this period). */
  previous: number | null;
  unit: MetricUnit;
  /**
   * A companion name or label — `workshop.bottleneck_stage`'s stage name,
   * `products.top_seller_units`'s product name, `expenses
   * .largest_category_amount`'s category name. D1/D2 as written give a
   * `format: 'text'` card and several "+ `_name`" companion keys in the card
   * inventory, but D2's own `MetricValue` interface is numeric-only — it has
   * no way to carry a name. Rather than inventing a second metric key per
   * pair (doubling the registry for no reason) or a parallel non-numeric
   * response shape, this one optional field carries it: a text card reads
   * `label` and ignores `value`; a numbered card with a companion name (the
   * "+ `_name`" pairs) reads both. Documented deviation from D2's literal
   * interface — see the WO-A.4/A.3 PR.
   */
  label?: string;
}

export interface MetricProvider {
  /** Unique across every registered provider — named in the boot-time duplicate-key error, so make it identifiable (module + concern). */
  id: string;
  /** Every metric key this provider can ever answer. Two providers claiming the same key throws at registration. */
  keys: readonly string[];
  /**
   * Any ONE of these permissions is enough to invoke this provider — never
   * invoked-then-filtered, since that would leak both work and timing to a
   * caller who cannot see the result. Empty means `analytics.view` (every
   * dashboard card requires at least that much).
   */
  permissions: readonly PermissionKey[];
  /** `wanted` is the subset of `keys` actually requested this call — never assume every key is wanted. */
  collect(ctx: MetricContext, wanted: readonly string[]): Promise<Record<string, MetricValue>>;
}
