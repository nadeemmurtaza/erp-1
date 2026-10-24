import { Injectable } from '@nestjs/common';
import { slugifyWithFallback, uniqueSlug } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';

/**
 * Helpers shared by every bom.* domain service (raw materials now; recipes
 * and production runs in WO-C.2/C.3). Kept here rather than duplicated so
 * "which category do raw materials live in" and "how is a raw-material SKU
 * generated" each have exactly one answer.
 */
@Injectable()
export class BomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The Category every RawMaterial's Product is filed under. Seeded at boot
   * by seedRawMaterialCategory() — a missing row here is a broken seed, not a
   * user-facing condition, so this throws loudly like
   * InventoryService.defaultLocationId() does for the same reason.
   */
  async resolveCategoryId(): Promise<string> {
    const slug = await this.settings.get<string>(SettingKey.BomRawMaterialCategorySlug);
    const category = await this.prisma.category.findUniqueOrThrow({ where: { slug } });
    return category.id;
  }

  /** RM-<slugified-name>, deduped against existing SKUs sharing that base. */
  async generateSku(name: string): Promise<string> {
    const base = `RM-${slugifyWithFallback(name, 'material').toUpperCase()}`;

    const clashes = await this.prisma.productVariant.findMany({
      where: { sku: { startsWith: base } },
      select: { sku: true },
    });

    return uniqueSlug(
      base,
      clashes.map((row) => row.sku),
    );
  }
}
