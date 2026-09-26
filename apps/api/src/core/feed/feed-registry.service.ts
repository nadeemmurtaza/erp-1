import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.constants';
import type { FeedEntry, FeedSource } from './feed-source';

const DEFAULT_PAGE_SIZE = 20;

/**
 * The registry half of the live-feed extension point
 * (analytics-reporting/58-live-operational-feed.md, WO-58.2) — the identical
 * `ActionHubRegistryService` shape, adapted for a cursor instead of a
 * one-shot fetch. `@Global` via `FeedModule`, so any module injects it
 * directly and registers its own source from its own `onModuleInit()` — the
 * feed never imports a feature module.
 */
@Injectable()
export class FeedRegistryService {
  private readonly logger = new Logger(FeedRegistryService.name);
  private readonly sources = new Map<string, FeedSource>();

  /** Throws, naming both source ids, if two sources register the same id — `ActionHubRegistryService`'s own duplicate-registration guard. */
  register(source: FeedSource): void {
    const existing = this.sources.get(source.id);
    if (existing) {
      throw new Error(`Duplicate feed source id "${source.id}": already registered.`);
    }
    this.sources.set(source.id, source);
  }

  /**
   * Resolves `sinceId` (a previously-issued `FeedEntry.id`) to the
   * `occurredAt` it named, by asking whichever registered source owns that
   * id's own prefix — the registry itself holds no domain knowledge of what
   * an "order" or a "payment" is. A cursor naming a row that no longer
   * exists, or no source at all, resolves to `null` (fetch the most recent
   * page) rather than throwing — a stale cursor is not a caller error.
   */
  private async resolveSince(sinceId: string | null): Promise<Date | null> {
    if (!sinceId) return null;
    const owner = [...this.sources.values()].find((source) => sinceId.startsWith(`${source.entryPrefix}:`));
    if (!owner) return null;
    return owner.resolveCursor(sinceId);
  }

  /**
   * Calls every registered source for `user`, in parallel, each already
   * scoped to `since`/`locationId` and capped at `limit`. One source
   * throwing (a module mid-outage) never blanks the others — logged, and
   * its `kind` is reported in `unavailableKinds` so the UI can say
   * "temporarily unavailable" for that section specifically, exactly
   * `ActionHubRegistryService.collect()`'s own isolation.
   */
  async collect(
    user: AuthenticatedUser,
    sinceId: string | null,
    locationId: string | undefined,
    limit = DEFAULT_PAGE_SIZE,
  ): Promise<{ items: FeedEntry[]; unavailableKinds: string[] }> {
    const since = await this.resolveSince(sinceId);
    const unavailableKinds: string[] = [];

    const batches = await Promise.all(
      [...this.sources.values()].map(async (source) => {
        try {
          return await source.fetchRecent(user, since, locationId, limit);
        } catch (error) {
          this.logger.error(
            `Feed source "${source.id}" failed; its entries are omitted`,
            error instanceof Error ? error.stack : String(error),
          );
          unavailableKinds.push(source.kind);
          return [] as FeedEntry[];
        }
      }),
    );

    const items = batches
      .flat()
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);

    return { items, unavailableKinds };
  }

  /** For tests and diagnostics — how many sources are currently registered. */
  get sourceCount(): number {
    return this.sources.size;
  }
}
