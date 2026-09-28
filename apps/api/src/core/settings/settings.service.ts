import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TieredCache } from '../cache/tiered-cache';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/client';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_SETTINGS, SettingKey } from './settings.defaults';

/**
 * L1: how long this process serves a setting it has read. Unchanged from the
 * hand-rolled cache it replaces (208-l1-l2-l3-caching-architecture.md §1) — it
 * is also the longest another replica can serve a value after a write, since
 * nothing pushes the write to a replica that did not make it.
 */
export const SETTINGS_L1_TTL_MS = 30_000;
/**
 * L1 entries per process. The key set is closed — SettingKey names 79 keys
 * and no caller builds one — so this never evicts a real key: ~12× headroom
 * for new settings. It exists so a future caller that did build keys could
 * not grow the map without limit.
 */
export const SETTINGS_L1_MAX_ENTRIES = 1_000;
/**
 * L2: how long a setting is shared in Redis (`settings:{key}`, doc 208 §2).
 * Deleted on every write, so it is never what makes a replica stale — it
 * bounds only a write that bypassed set(), and saves each replica a Postgres
 * read every 30 s.
 */
export const SETTINGS_L2_TTL_MS = 300_000;

/** Boxed, so a key with no row and no default (undefined) is still a cache hit — as it was before. */
interface CachedSetting {
  value: unknown;
}

/**
 * Runtime business configuration, read from the Setting table and cached so
 * hot paths (every cart total needs the shipping zones) do not hit the
 * database on each request: in this process for 30 s (L1), and in Redis for
 * every replica for 300 s (L2) — TieredCache, core/cache.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache: TieredCache<CachedSetting>;

  constructor(
    private readonly prisma: PrismaService,
    redis: RedisService,
  ) {
    this.cache = new TieredCache<CachedSetting>(redis, this.logger, {
      namespace: 'settings',
      l1: { maxEntries: SETTINGS_L1_MAX_ENTRIES, ttlMs: SETTINGS_L1_TTL_MS },
      l2: { ttlMs: SETTINGS_L2_TTL_MS },
      decode: (json) => (typeof json === 'object' && json !== null ? { value: (json as CachedSetting).value } : undefined),
    });
  }

  /** Seeds any missing defaults so a fresh database is immediately usable. */
  async onModuleInit(): Promise<void> {
    const existing = await this.prisma.setting.findMany({ select: { key: true } });
    const have = new Set(existing.map((row) => row.key));

    const missing = Object.entries(DEFAULT_SETTINGS).filter(([key]) => !have.has(key));
    if (missing.length === 0) return;

    await this.prisma.setting.createMany({
      data: missing.map(([key, value]) => ({
        key,
        value: value as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    this.logger.log(`Seeded ${missing.length} default setting(s)`);
  }

  async get<T>(key: string): Promise<T> {
    const cached = await this.cache.getOrLoad(key, async () => {
      const row = await this.prisma.setting.findUnique({ where: { key } });
      return { value: { value: row ? row.value : DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] } };
    });
    return cached.value as T;
  }

  /**
   * Writes, then drops the key from this process's L1 and from the shared L2,
   * so this replica reads the new value at once and every other replica reads
   * it from Postgres as soon as its own L1 entry (≤30 s) lapses — never an L2
   * copy of the old one.
   */
  async set(key: string, value: unknown, description?: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, description },
      update: { value: value as Prisma.InputJsonValue, description },
    });
    await this.cache.invalidate(key);
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  /** Drops every cached setting, here and in the shared L2; call after a bulk settings update. */
  async invalidate(): Promise<void> {
    await this.cache.invalidateAll();
  }

  // --- Typed helpers for the settings the checkout path needs ---------------

  async getCodFee(): Promise<number> {
    return this.get<number>(SettingKey.CodFee);
  }

  async getCatalogSkuTemplate(): Promise<string> {
    return this.get<string>(SettingKey.CatalogSkuTemplate);
  }

  /** WO-3.2's cutover switch — see the setting's own doc comment for why this exists instead of a soak timer. */
  async getUseOptionModelReads(): Promise<boolean> {
    return this.get<boolean>(SettingKey.CatalogUseOptionModelReads);
  }

  /** access-control-identity/21-access-over-the-org-tree.md — see the setting's own doc comment for why this lives here rather than on BrandPolicy. */
  async getOrgAccessMaxGrantDays(): Promise<number> {
    return this.get<number>(SettingKey.OrgAccessMaxGrantDays);
  }

  /** attendance-workforce/22-attendance-shifts-leave.md — see attendance-time.ts. */
  async getAttendanceWorkingDayCutoverHour(): Promise<number> {
    return this.get<number>(SettingKey.AttendanceWorkingDayCutoverHour);
  }

  async getAttendanceShiftGraceMinutes(): Promise<number> {
    return this.get<number>(SettingKey.AttendanceShiftGraceMinutes);
  }

  async getAttendanceDuplicateWindowMinutes(): Promise<number> {
    return this.get<number>(SettingKey.AttendanceDuplicateWindowMinutes);
  }

  async getAttendanceMaxSelfAdjustMinutes(): Promise<number> {
    return this.get<number>(SettingKey.AttendanceMaxSelfAdjustMinutes);
  }
}
