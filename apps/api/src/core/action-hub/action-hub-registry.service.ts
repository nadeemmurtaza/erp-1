import { Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.constants';
import type { ActionHubSource, ActionItem } from './action-hub-source';

/**
 * The registry half of the extension point
 * (admin-platform/44-manager-action-hub.md). `@Global` via
 * `ActionHubModule`, so any module injects it directly and registers its
 * own source from its own `onModuleInit()` — the hub never imports a
 * feature module.
 */
@Injectable()
export class ActionHubRegistryService {
  private readonly logger = new Logger(ActionHubRegistryService.name);
  private readonly sources = new Map<string, ActionHubSource>();

  /** Throws, naming both source ids, if two sources register the same id — the same duplicate-registration guard `MetricRegistryService` uses. */
  register(source: ActionHubSource): void {
    const existing = this.sources.get(source.id);
    if (existing) {
      throw new Error(`Duplicate action-hub source id "${source.id}": already registered.`);
    }
    this.sources.set(source.id, source);
  }

  /**
   * Calls every registered source for `user`, in parallel, and merges the
   * result sorted by `dueBy` (items with no deadline last). One source
   * throwing (a module mid-outage) never blanks the others — it is logged
   * and its `kind` is reported in `unavailableKinds` so the UI can say
   * "temporarily unavailable" for that section specifically.
   */
  async collect(user: AuthenticatedUser): Promise<{ items: ActionItem[]; unavailableKinds: string[] }> {
    const unavailableKinds: string[] = [];

    const batches = await Promise.all(
      [...this.sources.values()].map(async (source) => {
        try {
          return await source.fetchFor(user);
        } catch (error) {
          this.logger.error(
            `Action-hub source "${source.id}" failed; its items are omitted`,
            error instanceof Error ? error.stack : String(error),
          );
          unavailableKinds.push(source.kind);
          return [] as ActionItem[];
        }
      }),
    );

    const items = batches.flat().sort((a, b) => {
      if (a.dueBy === null && b.dueBy === null) return 0;
      if (a.dueBy === null) return 1;
      if (b.dueBy === null) return -1;
      return a.dueBy.getTime() - b.dueBy.getTime();
    });

    return { items, unavailableKinds };
  }

  /** For tests and diagnostics — how many sources are currently registered. */
  get sourceCount(): number {
    return this.sources.size;
  }
}
