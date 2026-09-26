import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/client';
import { DEFAULT_SETTINGS, SettingKey } from './settings.defaults';

const CACHE_TTL_MS = 30_000;

/**
 * Runtime business configuration, read from the Setting table and cached
 * briefly so hot paths (every cart total needs the shipping zones) do not hit
 * the database on each request.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

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
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const row = await this.prisma.setting.findUnique({ where: { key } });
    const value = row ? row.value : DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS];

    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value as T;
  }

  async set(key: string, value: unknown, description?: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, description },
      update: { value: value as Prisma.InputJsonValue, description },
    });
    this.cache.delete(key);
  }

  async getAll(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  /** Clears the cache; call after a bulk settings update. */
  invalidate(): void {
    this.cache.clear();
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
