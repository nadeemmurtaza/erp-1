import { Injectable, Logger } from '@nestjs/common';
import type { PermissionKey } from '@newax/shared';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/settings.defaults';
import type { MetricBucket } from '../time/metric-window';
import type { MetricContext, MetricProvider, MetricValue } from './metric-provider';

interface CacheEntry {
  expiresAt: number;
  value: Record<string, MetricValue>;
}

/**
 * The registry half of the extension point (10-admin-dashboard.md D2,
 * WO-A.3). `@Global` via `MetricsModule`, so any module can inject this
 * without importing another module — the same shape as
 * `core/extension-points/stock-intake.registry.ts`.
 */
@Injectable()
export class MetricRegistryService {
  private readonly logger = new Logger(MetricRegistryService.name);
  private readonly providers: MetricProvider[] = [];
  private readonly keyOwners = new Map<string, string>();
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly settings: SettingsService) {}

  /**
   * Called from a provider module's own `onModuleInit()`. Throws, naming
   * both provider ids, the instant two providers claim the same metric key —
   * silent last-write-wins would be a very expensive bug to chase later. A
   * module disabled by `MODULES` simply never calls this, so its metrics are
   * absent with no DI failure and no conditional import anywhere.
   */
  register(provider: MetricProvider): void {
    for (const key of provider.keys) {
      const owner = this.keyOwners.get(key);
      if (owner) {
        throw new Error(
          `Duplicate metric key "${key}": claimed by both "${owner}" and "${provider.id}". ` +
            'Two metric providers may never claim the same key — see 10-admin-dashboard.md D2.',
        );
      }
      this.keyOwners.set(key, provider.id);
    }
    this.providers.push(provider);
  }

  /**
   * Runs every eligible provider concurrently and merges their results. A
   * provider whose `permissions` the caller lacks is never invoked at all —
   * invoking then filtering the result would still leak its work and its
   * timing. A provider that throws is logged and only ITS keys are omitted;
   * the rest of the batch still returns.
   *
   * Cached in-process, keyed on `(from, to, bucket, sorted permission
   * fingerprint, sorted wanted keys)` — an ADMIN's cached cost figures can
   * never be served to a STAFF request because the fingerprint differs.
   * `AnalyticsDashboardCacheSeconds` set to 0 disables the cache entirely.
   */
  async collect(
    ctx: MetricContext,
    wanted: readonly string[],
    bucket: MetricBucket = 'day',
  ): Promise<Record<string, MetricValue>> {
    const ttlSeconds = await this.settings.get<number>(SettingKey.AnalyticsDashboardCacheSeconds);
    const cacheKey = this.cacheKey(ctx, wanted, bucket);

    if (ttlSeconds > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    const wantedSet = new Set(wanted);
    const eligible = this.providers.filter(
      (provider) => provider.keys.some((key) => wantedSet.has(key)) && this.isPermitted(provider, ctx.permissions),
    );

    const batches = await Promise.all(
      eligible.map(async (provider) => {
        const providerWanted = provider.keys.filter((key) => wantedSet.has(key));
        try {
          return await provider.collect(ctx, providerWanted);
        } catch (error) {
          this.logger.error(
            `Metric provider "${provider.id}" failed; omitting its keys [${providerWanted.join(', ')}]`,
            error instanceof Error ? error.stack : String(error),
          );
          return {};
        }
      }),
    );

    const merged: Record<string, MetricValue> = {};
    for (const batch of batches) Object.assign(merged, batch);

    if (ttlSeconds > 0) {
      this.cache.set(cacheKey, { expiresAt: Date.now() + ttlSeconds * 1000, value: merged });
    }
    return merged;
  }

  private isPermitted(provider: MetricProvider, callerPermissions: readonly PermissionKey[]): boolean {
    const required = provider.permissions.length > 0 ? provider.permissions : (['analytics.view'] as PermissionKey[]);
    return required.some((permission) => callerPermissions.includes(permission));
  }

  /**
   * Every metric key currently registered, across every provider — the
   * dashboard's own `groups=` query param resolves against this rather than
   * a second, hand-kept list of "which keys belong to which group": every
   * key in this card inventory is already `<group>.<name>` (`sales.revenue`,
   * `orders.total`), so "the sales group" IS "every key prefixed `sales.`".
   * Keeps the group→key mapping in exactly one place — the keys themselves
   * — instead of a copy the frontend's `card-registry.ts` and this service
   * could quietly drift apart from.
   */
  allKeys(): string[] {
    return [...this.keyOwners.keys()];
  }

  /** `allKeys()` filtered to the requested group prefixes (the segment before the first `.`). Empty `groups` returns every key. */
  keysForGroups(groups: readonly string[]): string[] {
    if (groups.length === 0) return this.allKeys();
    const wanted = new Set(groups);
    return this.allKeys().filter((key) => wanted.has(key.split('.')[0] ?? ''));
  }

  private cacheKey(ctx: MetricContext, wanted: readonly string[], bucket: MetricBucket): string {
    const sortedPermissions = [...ctx.permissions].sort().join(',');
    const sortedWanted = [...wanted].sort().join(',');
    return [ctx.from.toISOString(), ctx.to.toISOString(), bucket, sortedPermissions, sortedWanted].join('|');
  }
}
