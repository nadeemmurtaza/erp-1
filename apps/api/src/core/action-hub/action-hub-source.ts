import type { AuthenticatedUser } from '../auth/auth.constants';

/**
 * The manager action hub (admin-platform/44-manager-action-hub.md) — one
 * queue aggregating "what needs my signature" across every optional module
 * that has something pending, without the hub ever importing a feature
 * module directly. Mirrors the registration-not-import shape
 * `core/metrics/metric-provider.ts` already established for dashboard
 * cards: a source registers itself from its own module's `onModuleInit()`.
 *
 * Deviation from the doc's own literal interface, stated here per
 * `CLAUDE.md`'s "say so rather than quietly doing something else": the doc
 * writes `fetchFor(actorPositionId: string)`, assuming a management
 * position/reporting-line hierarchy. No such concept exists anywhere in
 * this codebase's schema or permission model — `payroll.manage`,
 * `purchasing.manage` and every other `.manage` permission this codebase
 * actually has are flat grants, not scoped to a position's own reports.
 * `fetchFor` therefore takes the caller's resolved `AuthenticatedUser`
 * (id + permissions), and each source scopes its own query by the
 * permission it already requires for that data — the same "a source
 * returns only what its own module would already show this caller"
 * safety property the doc's own scope lenses require, expressed through
 * this codebase's real authorization primitive instead of an invented one.
 */
export interface ActionItem {
  /** `"leave:req_123"` — sourced from the underlying row's own id, never generated. */
  id: string;
  kind: string;
  subjectEmployeeName: string;
  /** `"Leave request, 3 days, Ahmed Raza"`. */
  summary: string;
  /** `null` when there is no real deadline — never a fabricated one. */
  dueBy: Date | null;
  /** Deep link to the real screen that acts on it — the hub itself never acts. */
  href: string;
  /** The `PermissionKey` gating that `href`, so a filtered-out item never leaks by rendering. */
  permission: string;
}

export interface ActionHubSource {
  /** Unique across every registered source. */
  readonly id: string;
  readonly kind: string;
  /**
   * Reads only rows the caller may already act on — the hub applies no
   * filtering of its own beyond what the source itself already scopes.
   * A source over its own per-call cap paginates via its own `href`
   * ("N+ more, view all") rather than returning an unbounded list.
   */
  fetchFor(user: AuthenticatedUser): Promise<ActionItem[]>;
}
