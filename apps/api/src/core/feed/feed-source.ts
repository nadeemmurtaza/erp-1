import type { AuthenticatedUser } from '../auth/auth.constants';

/**
 * The live operational feed (analytics-reporting/58-live-operational-feed.md)
 * — a read-model over rows `Order`/`PurchaseOrder`/`Payment` already record,
 * merged through the identical registration-not-import shape doc 44 already
 * established for the manager action hub (`ActionHubSource`). A fourth
 * source (a transfer, a returned item) is a new implementation of this
 * interface, never a change to the registry or the feed endpoint.
 */
export interface FeedEntry {
  /** `"order:ord_123"` — sourced from the underlying row's own id, never generated. */
  id: string;
  kind: 'ORDER' | 'PURCHASE_ORDER' | 'PAYMENT';
  /** `"Order #YSN-2026-0412 placed, Rs 4,500"`. */
  summary: string;
  occurredAt: Date;
  /** Deep link to the real record this entry summarizes — the feed never edits anything. */
  href: string;
  /** `null` when the source record itself carries no location — never defaulted (`CLAUDE.md`'s "movement with no address"). */
  locationId: string | null;
}

export interface FeedSource {
  /** Unique across every registered source. */
  readonly id: string;
  readonly kind: FeedEntry['kind'];
  /** The prefix this source's own entry ids use (`'order'`, `'po'`, `'payment'`) — how the registry finds which source owns an incoming cursor. */
  readonly entryPrefix: string;
  /** Looks up `occurredAt` for one of this source's own previously-issued entry ids. `null` if the row no longer exists (a stale or foreign cursor). */
  resolveCursor(entryId: string): Promise<Date | null>;
  /**
   * Reads only rows the caller may already see — the registry applies no
   * filtering of its own beyond what the source itself scopes by
   * permission and `locationId`. Always bounded by `limit`, newest first.
   */
  fetchRecent(user: AuthenticatedUser, since: Date | null, locationId: string | undefined, limit: number): Promise<FeedEntry[]>;
}
