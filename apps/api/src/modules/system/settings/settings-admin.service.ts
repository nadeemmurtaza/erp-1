import { SettingsService } from '../../../core/settings/settings.service';
import {
  DEFAULT_SETTINGS,
  SettingKey,
  type DocumentSettings,
} from '../../../core/settings/settings.defaults';
import { Injectable } from '@nestjs/common';
import { AiService } from '../../../core/ai/ai.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '../../../core/prisma/client';

export interface AuditLogQuery {
  entity?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  page: number;
  perPage: number;
}

/**
 * Backs the /admin/settings screen: the permission catalog, each role's
 * current grants (editable here — the whole point of PBAC over the old
 * hardcoded RolesGuard), and a read view over the audit trail that has been
 * writing silently since core/audit/audit.service.ts with no viewer until now.
 */
@Injectable()
export class SettingsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly ai: AiService,
  ) {}

  /**
   * How uploaded images are stored.
   *
   * A Setting rather than an env var, because it is a shop's decision and has
   * to be reversible from the back office without a deploy (House Rule 4).
   * It governs new uploads only — images already stored keep the format they
   * were written in.
   */
  async getMedia(): Promise<{ webpEnabled: boolean }> {
    return {
      webpEnabled: (await this.settings.get<boolean>(SettingKey.MediaWebpEnabled)) !== false,
    };
  }

  async updateMedia(webpEnabled: boolean): Promise<{ webpEnabled: boolean }> {
    await this.settings.set(SettingKey.MediaWebpEnabled, webpEnabled);
    return { webpEnabled };
  }

  /** What receipts, invoices and emails show, and how documents are numbered. */
  async getDocuments(): Promise<DocumentSettings> {
    const stored = await this.settings.get<DocumentSettings>(SettingKey.Documents);
    const shipped = DEFAULT_SETTINGS[SettingKey.Documents] as DocumentSettings;
    // Merged rather than returned raw: a row written before a prefix existed
    // would otherwise hand the form `undefined` for it.
    return {
      logoSource: stored?.logoSource ?? shipped.logoSource,
      logoUrl: stored?.logoUrl ?? null,
      prefixes: { ...shipped.prefixes, ...(stored?.prefixes ?? {}) },
    };
  }

  async updateDocuments(patch: {
    logoSource?: DocumentSettings['logoSource'];
    logoUrl?: string | null;
    // Partial on purpose: the form sends only the prefixes it changed.
    prefixes?: Partial<DocumentSettings['prefixes']>;
  }): Promise<DocumentSettings> {
    const current = await this.getDocuments();
    const next: DocumentSettings = {
      logoSource: patch.logoSource ?? current.logoSource,
      logoUrl: patch.logoUrl === undefined ? current.logoUrl : patch.logoUrl,
      prefixes: { ...current.prefixes, ...(patch.prefixes ?? {}) },
    };
    await this.settings.set(SettingKey.Documents, next);
    return next;
  }

  /**
   * House Rule 8's "isAvailable() before rendering an AI-powered button at
   * all" — the /admin/ai screen (and every future AI-powered admin screen)
   * reads this once rather than each hand-rolling its own availability
   * check. Provider identity is env-configured (AI_PROVIDERS), same as
   * PAYMENT_PROVIDERS elsewhere — this is a read-only status, not a toggle.
   */
  async getAi() {
    const [monthlyBudgetPaisa, usdToPkrRate, monthToDateSpendPaisa] = await Promise.all([
      this.settings.get<number | null>(SettingKey.AiMonthlyBudgetPaisa),
      this.settings.get<number>(SettingKey.AiUsdToPkrRate),
      this.ai.monthToDateSpendPaisa(),
    ]);

    return {
      providers: {
        anthropic: this.config.isAiProviderEnabled('anthropic'),
        openai: this.config.isAiProviderEnabled('openai'),
      },
      capabilities: {
        complete: this.ai.isAvailable('complete'),
        embed: this.ai.isAvailable('embed'),
        vision: this.ai.isAvailable('vision'),
      },
      monthlyBudgetPaisa: monthlyBudgetPaisa ?? null,
      usdToPkrRate,
      monthToDateSpendPaisa,
    };
  }

  async updateAi(patch: { monthlyBudgetPaisa?: number | null; usdToPkrRate?: number }) {
    if (patch.monthlyBudgetPaisa !== undefined) {
      await this.settings.set(SettingKey.AiMonthlyBudgetPaisa, patch.monthlyBudgetPaisa);
    }
    if (patch.usdToPkrRate !== undefined) {
      await this.settings.set(SettingKey.AiUsdToPkrRate, patch.usdToPkrRate);
    }
    return this.getAi();
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { label: 'asc' }],
    });
  }

  async listAuditLog(query: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    return { total, page: query.page, perPage: query.perPage, entries };
  }
}
