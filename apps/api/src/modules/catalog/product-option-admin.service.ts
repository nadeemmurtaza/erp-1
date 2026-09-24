import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Prisma } from '../../core/prisma/client';
import type { CreateProductOptionDto, UpsertOptionValueDto } from './dto/option.dto';

const optionInclude = {
  translations: true,
  values: { include: { translations: true }, orderBy: { order: 'asc' as const } },
} as const;

/**
 * A product's own option axes (WO-3.1, 03-variants-sku-seo.md) — the part of
 * the variant matrix builder that lets a boutique add "Sleeve length" from
 * the admin with no migration and no developer, either typed by hand or
 * instantiated from a store-level OptionTemplate.
 */
@Injectable()
export class ProductOptionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(productId: string) {
    return this.prisma.productOption.findMany({
      where: { productId },
      include: optionInclude,
      orderBy: { order: 'asc' },
    });
  }

  async create(actorId: string, productId: string, dto: CreateProductOptionDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('That product no longer exists.');

    const existing = await this.prisma.productOption.findUnique({
      where: { productId_key: { productId, key: dto.key } },
    });
    if (existing) throw new BadRequestException(`This product already has an option keyed "${dto.key}".`);

    const option = await this.prisma.productOption.create({
      data: {
        productId,
        key: dto.key.trim(),
        display: dto.display ?? 'BUTTON',
        order: dto.order ?? (await this.prisma.productOption.count({ where: { productId } })),
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, label: t.label.trim() })) },
        values: dto.values?.length
          ? {
              create: dto.values.map((value, index) => ({
                key: value.key.trim(),
                swatchHex: value.swatchHex?.trim() || null,
                swatchUrl: value.swatchUrl?.trim() || null,
                order: value.order ?? index,
                translations: { create: value.translations.map((t) => ({ locale: t.locale, label: t.label.trim() })) },
              })),
            }
          : undefined,
      },
      include: optionInclude,
    });

    await this.audit.record({
      actorId,
      action: 'catalog.product_option_created',
      entity: 'Product',
      entityId: productId,
      data: { optionKey: option.key },
    });

    return option;
  }

  /**
   * Copies an OptionTemplate's values into a new ProductOption on this
   * product. Independent afterwards — editing the template later never
   * silently changes this product (doc's own explicit requirement).
   */
  async instantiateTemplate(actorId: string, productId: string, templateId: string, order?: number) {
    const [product, template] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId } }),
      this.prisma.optionTemplate.findUnique({
        where: { id: templateId },
        include: { translations: true, values: { include: { translations: true }, orderBy: { order: 'asc' } } },
      }),
    ]);
    if (!product) throw new NotFoundException('That product no longer exists.');
    if (!template) throw new NotFoundException('That option template no longer exists.');

    const existing = await this.prisma.productOption.findUnique({
      where: { productId_key: { productId, key: template.key } },
    });
    if (existing) throw new BadRequestException(`This product already has an option keyed "${template.key}".`);

    const option = await this.prisma.productOption.create({
      data: {
        productId,
        key: template.key,
        display: template.display,
        order: order ?? (await this.prisma.productOption.count({ where: { productId } })),
        translations: { create: template.translations.map((t) => ({ locale: t.locale, label: t.label })) },
        values: {
          create: template.values.map((value) => ({
            key: value.key,
            swatchHex: value.swatchHex,
            swatchUrl: value.swatchUrl,
            order: value.order,
            translations: { create: value.translations.map((t) => ({ locale: t.locale, label: t.label })) },
          })),
        },
      },
      include: optionInclude,
    });

    await this.audit.record({
      actorId,
      action: 'catalog.product_option_instantiated',
      entity: 'Product',
      entityId: productId,
      data: { optionKey: option.key, templateId },
    });

    return option;
  }

  async addValue(actorId: string, optionId: string, dto: UpsertOptionValueDto) {
    const option = await this.prisma.productOption.findUnique({ where: { id: optionId }, include: optionInclude });
    if (!option) throw new NotFoundException('That option no longer exists.');

    const value = await this.prisma.productOptionValue.create({
      data: {
        optionId,
        key: dto.key.trim(),
        swatchHex: dto.swatchHex?.trim() || null,
        swatchUrl: dto.swatchUrl?.trim() || null,
        order: dto.order ?? option.values.length,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, label: t.label.trim() })) },
      },
      include: { translations: true },
    });

    await this.audit.record({
      actorId,
      action: 'catalog.product_option_value_added',
      entity: 'Product',
      entityId: option.productId,
      data: { optionKey: option.key, valueKey: value.key },
    });

    return value;
  }

  /**
   * Removing a value that variants still use must fail loudly (the schema's
   * own `onDelete: Restrict`) rather than silently orphaning them — this
   * checks first so the UI can explain it before the user tries, per the
   * doc's own instruction, instead of surfacing a raw FK error.
   */
  async deleteValue(actorId: string, valueId: string): Promise<void> {
    const value = await this.prisma.productOptionValue.findUnique({
      where: { id: valueId },
      include: { option: true, _count: { select: { variantLinks: true } } },
    });
    if (!value) throw new NotFoundException('That value no longer exists.');

    if (value._count.variantLinks > 0) {
      throw new BadRequestException(
        `"${value.key}" is used by ${value._count.variantLinks} variant(s). Deactivate those variants first, or remove them from the matrix, before deleting this value.`,
      );
    }

    await this.prisma.productOptionValue.delete({ where: { id: valueId } });
    await this.audit.record({
      actorId,
      action: 'catalog.product_option_value_deleted',
      entity: 'Product',
      entityId: value.option.productId,
      data: { optionKey: value.option.key, valueKey: value.key },
    });
  }

  async deleteOption(actorId: string, optionId: string): Promise<void> {
    const option = await this.prisma.productOption.findUnique({
      where: { id: optionId },
      include: { values: { include: { _count: { select: { variantLinks: true } } } } },
    });
    if (!option) throw new NotFoundException('That option no longer exists.');

    const inUse = option.values.filter((value) => value._count.variantLinks > 0);
    if (inUse.length > 0) {
      throw new BadRequestException(
        `"${option.key}" still has ${inUse.length} value(s) in use by a variant. Remove those variants from the matrix first.`,
      );
    }

    await this.prisma.productOption.delete({ where: { id: optionId } });
    await this.audit.record({
      actorId,
      action: 'catalog.product_option_deleted',
      entity: 'Product',
      entityId: option.productId,
      data: { optionKey: option.key },
    });
  }

  /**
   * Attaches a variant to its option values (one per axis, in the product's
   * option order) and recomputes `ProductVariant.label` from them — the
   * matrix builder's own write path, independent of syncOptionModel's
   * size/color-derived one, so a genuinely custom axis (never named "size"
   * or "colour") is captured correctly with no migration.
   */
  async syncVariantOptionValues(
    tx: Prisma.TransactionClient,
    productId: string,
    variantId: string,
    optionValueKeys: string[],
  ): Promise<void> {
    if (optionValueKeys.length === 0) return;

    const options = await tx.productOption.findMany({
      where: { productId },
      include: { values: { include: { translations: true } } },
      orderBy: { order: 'asc' },
    });

    const labelParts: string[] = [];
    for (const [index, valueKey] of optionValueKeys.entries()) {
      const option = options[index];
      if (!option) continue;
      const value = option.values.find((v) => v.key === valueKey);
      if (!value) continue;

      await tx.productVariantOptionValue.upsert({
        where: { variantId_optionId: { variantId, optionId: option.id } },
        update: { valueId: value.id },
        create: { variantId, optionId: option.id, valueId: value.id },
      });
      labelParts.push(value.translations.find((t) => t.locale === 'en')?.label ?? value.key);
    }

    if (labelParts.length > 0) {
      await tx.productVariant.update({ where: { id: variantId }, data: { label: labelParts.join(' / ') } });
    }
  }
}
