import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../prisma/client';
import { DEFAULT_SETTINGS, SettingKey, type ShippingZone } from './settings.defaults';

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

  async getShippingZones(): Promise<ShippingZone[]> {
    return this.get<ShippingZone[]>(SettingKey.ShippingZones);
  }

  /**
   * Resolves a delivery city to its zone, falling back to the catch-all zone
   * (the one with no cities listed) and finally to the last zone defined.
   */
  async resolveShippingZone(city: string): Promise<ShippingZone> {
    const zones = await this.getShippingZones();
    const needle = city.trim().toLowerCase();

    const matched = zones.find((zone) =>
      zone.cities.some((candidate) => candidate.toLowerCase() === needle),
    );
    if (matched) return matched;

    const fallback = zones.find((zone) => zone.cities.length === 0);
    if (fallback) return fallback;

    const last = zones[zones.length - 1];
    if (!last) {
      throw new Error('No shipping zones are configured');
    }
    return last;
  }

  async getCodFee(): Promise<number> {
    return this.get<number>(SettingKey.CodFee);
  }
}
