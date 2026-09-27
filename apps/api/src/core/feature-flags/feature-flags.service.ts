import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 30_000;

interface CachedFlag {
  /** true when no FeatureFlag row exists for this key — a cached miss. */
  missing: boolean;
  rolloutPercent: number;
  enabledOrgIds: string[];
  killSwitch: boolean;
  expiresAt: number;
}

/**
 * resilience-scalability/37-scalability-future-upgrades.md (WO-37.2).
 *
 * `isEnabled(key, organizationId)` is the one call every other module goes
 * through to decide whether a de-risked capability is on for a given
 * organization — never a raw `prisma.featureFlag` read from outside this
 * service, the same "one writer per invariant" discipline CLAUDE.md already
 * states for stock.
 *
 * Cached the same way `SettingsService` caches `Setting` — a 30s in-process
 * TTL keyed by `key` (doc 37's own "hundred-thousandth row" lens: `isEnabled`
 * sits on the hot path of every request that touches a flagged feature, so
 * it must be a cached, indexed lookup, never a per-request query). The
 * honest cost of that cache: an ordinary rollout-percentage or allowlist
 * edit takes up to 30s to reach every process — acceptable for a staged
 * rollout, which is inherently a multi-minute-to-multi-day exercise, not a
 * kill switch. `killSwitch = true` cannot wait out that window on an
 * incident, so `FeatureFlagsAdminService` calls `invalidate(key)` on this
 * SAME process synchronously after writing it — that request's own process
 * sees the kill switch immediately; every other process still catches up
 * within the 30s TTL like any other change. A multi-process fleet is not
 * instant on this path; it is bounded, honestly, at 30s.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cache = new Map<string, CachedFlag>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Precedence, exactly as doc 37 states it:
   *   1. `killSwitch = true` forces off, regardless of everything else.
   *   2. `organizationId` in `enabledOrgIds` forces on.
   *   3. otherwise a stable (deterministic per organizationId, never
   *      re-randomized) hash-based rollout check against `rolloutPercent`.
   *   4. a flag row that does not exist for `key` returns `false` — fails
   *      closed to "off" (CLAUDE.md's own "the failure path" lens: never
   *      silently fails open for a money-adjacent flag).
   *
   * A DB error while refreshing an expired cache entry also fails closed
   * to `false` rather than throwing — a caller checking a flag must never
   * itself become the thing that breaks a request.
   */
  async isEnabled(key: string, organizationId: string | null): Promise<boolean> {
    const flag = await this.resolve(key);
    if (flag.missing) return false;
    if (flag.killSwitch) return false;
    if (organizationId && flag.enabledOrgIds.includes(organizationId)) return true;
    if (flag.rolloutPercent <= 0) return false;
    if (flag.rolloutPercent >= 100) return true;
    if (!organizationId) return false;
    return this.stableBucket(key, organizationId) < flag.rolloutPercent;
  }

  /**
   * Deterministic per (key, organizationId) — the same organization always
   * lands in the same bucket for the same flag, so widening a rollout from
   * 20% to 40% only ever ADDS organizations, never reshuffles who already
   * has it. `CLAUDE.md`'s "dry run before live" lens: a pure function, no
   * `prisma.` read, testable in isolation.
   */
  private stableBucket(key: string, organizationId: string): number {
    const digest = createHash('sha256').update(`${key}:${organizationId}`).digest();
    // First 4 bytes as an unsigned 32-bit int, modulo 100 — stable, evenly
    // distributed, no floating-point rounding.
    const bucket = digest.readUInt32BE(0) % 100;
    return bucket;
  }

  /** Never throws — a lookup failure resolves to a `missing` entry, so `isEnabled()` fails closed to `false`. */
  private async resolve(key: string): Promise<CachedFlag> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached;

    const missingEntry: CachedFlag = { missing: true, rolloutPercent: 0, enabledOrgIds: [], killSwitch: false, expiresAt: Date.now() + CACHE_TTL_MS };

    try {
      const row = await this.prisma.featureFlag.findUnique({
        where: { key },
        select: { rolloutPercent: true, enabledOrgIds: true, killSwitch: true },
      });
      // Cache the miss too — a nonexistent key polled on every request must
      // not hit the database every time either.
      const entry: CachedFlag = row ? { missing: false, ...row, expiresAt: Date.now() + CACHE_TTL_MS } : missingEntry;
      this.cache.set(key, entry);
      return entry;
    } catch (error) {
      this.logger.error(
        `featureFlag lookup failed for "${key}", failing closed to off: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Deliberately not cached: a transient DB error should not pin every
      // caller to "off" for the full TTL once the database recovers.
      return missingEntry;
    }
  }

  /**
   * Invalidates one key's cache entry on THIS process only, immediately —
   * see this class's own doc comment for why `killSwitch` needs this
   * instead of waiting out the 30s TTL. Called by `FeatureFlagsAdminService`
   * after every write.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }
}
