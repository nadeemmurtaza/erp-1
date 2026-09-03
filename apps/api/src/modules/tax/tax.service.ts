import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import type {
  CreateTaxClassDto,
  CreateTaxRateDto,
  UpdateTaxClassDto,
  UpdateTaxSettingsDto,
} from './dto/tax.dto';

/** What checkout actually needs to know about a class: its current rate. */
export interface ActiveTaxRate {
  taxClassId: string;
  rateBps: number;
}

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * There is no generic Setting-editing admin endpoint in this codebase yet
   * (settings-admin only covers permissions/roles/audit-log) — scoped to
   * exactly the three tax keys rather than building that generic mechanism
   * as a side effect of this module.
   */
  async getSettings() {
    const [enabled, pricingMode, defaultClass] = await Promise.all([
      this.settings.get<boolean>(SettingKey.TaxEnabled),
      this.settings.get<'INCLUSIVE' | 'EXCLUSIVE'>(SettingKey.TaxPricingMode),
      this.settings.get<string>(SettingKey.TaxDefaultClass),
    ]);
    return { enabled, pricingMode, defaultClass };
  }

  async updateSettings(dto: UpdateTaxSettingsDto) {
    if (dto.defaultClass !== undefined) {
      const exists = await this.prisma.taxClass.findUnique({ where: { key: dto.defaultClass } });
      if (!exists) throw new BadRequestException(`No tax class with key "${dto.defaultClass}".`);
    }
    if (dto.enabled === true) {
      const classCount = await this.prisma.taxClass.count();
      if (classCount === 0) {
        throw new BadRequestException('Create at least one tax class before turning tax on.');
      }
    }

    await Promise.all([
      dto.enabled !== undefined ? this.settings.set(SettingKey.TaxEnabled, dto.enabled) : null,
      dto.pricingMode !== undefined
        ? this.settings.set(SettingKey.TaxPricingMode, dto.pricingMode)
        : null,
      dto.defaultClass !== undefined
        ? this.settings.set(SettingKey.TaxDefaultClass, dto.defaultClass)
        : null,
    ]);
    return this.getSettings();
  }

  async listClasses() {
    return this.prisma.taxClass.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { rates: { where: { endedAt: null }, orderBy: { effectiveAt: 'desc' }, take: 1 } },
    });
  }

  async getClass(id: string) {
    const taxClass = await this.prisma.taxClass.findUnique({
      where: { id },
      include: { rates: { orderBy: { effectiveAt: 'desc' } } },
    });
    if (!taxClass) throw new NotFoundException('That tax class no longer exists.');
    return taxClass;
  }

  async createClass(dto: CreateTaxClassDto) {
    const existing = await this.prisma.taxClass.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('A tax class with that key already exists.');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taxClass.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.taxClass.create({
        data: {
          key: dto.key,
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          rates:
            dto.rateBps !== undefined
              ? { create: { rateBps: dto.rateBps } }
              : undefined,
        },
        include: { rates: true },
      });
    });
  }

  async updateClass(id: string, dto: UpdateTaxClassDto) {
    await this.getClass(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.taxClass.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.taxClass.update({
        where: { id },
        data: { name: dto.name, isDefault: dto.isDefault },
      });
    });
  }

  async deleteClass(id: string): Promise<void> {
    const taxClass = await this.getClass(id);

    const variantCount = await this.prisma.productVariant.count({ where: { taxClassId: id } });
    if (variantCount > 0) {
      throw new ConflictException(
        `${variantCount} product variant(s) still use this tax class. Reassign them first.`,
      );
    }

    const defaultKey = await this.settings.get<string>(SettingKey.TaxDefaultClass);
    if (taxClass.key === defaultKey) {
      throw new BadRequestException(
        'This is the store\'s default tax class. Set a different default before deleting it.',
      );
    }

    await this.prisma.taxClass.delete({ where: { id } });
  }

  /**
   * Ends whatever rate is currently active on the class and starts a new
   * one — TaxRate rows are never edited in place (House Rule 7: a snapshot
   * on an already-placed order must never be able to move retroactively,
   * and effective-dating is what makes that true even for rates nobody has
   * snapshotted yet).
   */
  async addRate(classId: string, dto: CreateTaxRateDto) {
    await this.getClass(classId);

    return this.prisma.$transaction(async (tx) => {
      await tx.taxRate.updateMany({
        where: { taxClassId: classId, endedAt: null },
        data: { endedAt: new Date() },
      });
      return tx.taxRate.create({
        data: { taxClassId: classId, rateBps: dto.rateBps },
      });
    });
  }

  /**
   * Every class's currently active rate, in one query — checkout needs this
   * for every stitched cart regardless of line count, and the tax-class
   * table is always small, so one query beats N+1 per line.
   */
  async activeRatesByClassId(): Promise<Map<string, number>> {
    const now = new Date();
    const rates = await this.prisma.taxRate.findMany({
      where: { effectiveAt: { lte: now }, OR: [{ endedAt: null }, { endedAt: { gt: now } }] },
      orderBy: { effectiveAt: 'desc' },
    });
    const byClassId = new Map<string, number>();
    for (const rate of rates) {
      // First hit per class wins — rates are ordered newest-first, and a
      // class only ever has one row with endedAt: null at a time (addRate
      // enforces it), so this is defensive rather than load-bearing.
      if (!byClassId.has(rate.taxClassId)) byClassId.set(rate.taxClassId, rate.rateBps);
    }
    return byClassId;
  }

  /** The store's default class id, resolved from the Setting's key. Null if misconfigured. */
  async defaultClassId(): Promise<string | null> {
    const key = await this.settings.get<string>(SettingKey.TaxDefaultClass);
    const taxClass = await this.prisma.taxClass.findUnique({ where: { key } });
    return taxClass?.id ?? null;
  }
}
