import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { CreateOptionTemplateDto, UpsertOptionValueDto } from './dto/option.dto';

const templateInclude = {
  translations: true,
  values: { include: { translations: true }, orderBy: { order: 'asc' as const } },
} as const;

/**
 * WO-3.1's store-level option library (03-variants-sku-seo.md) — "Size:
 * XS/S/M/L/XL/XXL" typed once under Catalogue -> Options & attributes
 * instead of on every product. A product instantiates from a template by
 * copying its values (ProductOptionAdminService.instantiateTemplate); editing
 * the template afterwards never silently changes a live product.
 */
@Injectable()
export class OptionTemplateAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.optionTemplate.findMany({
      include: templateInclude,
      orderBy: { order: 'asc' },
    });
  }

  async get(id: string) {
    const template = await this.prisma.optionTemplate.findUnique({ where: { id }, include: templateInclude });
    if (!template) throw new NotFoundException('That option template no longer exists.');
    return template;
  }

  async create(actorId: string, dto: CreateOptionTemplateDto) {
    const existing = await this.prisma.optionTemplate.findUnique({ where: { key: dto.key } });
    if (existing) throw new BadRequestException(`An option template with key "${dto.key}" already exists.`);

    const template = await this.prisma.optionTemplate.create({
      data: {
        key: dto.key.trim(),
        display: dto.display ?? 'BUTTON',
        order: dto.order ?? 0,
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
      include: templateInclude,
    });

    await this.audit.record({
      actorId,
      action: 'catalog.option_template_created',
      entity: 'OptionTemplate',
      entityId: template.id,
      data: { key: template.key },
    });

    return template;
  }

  async addValue(actorId: string, templateId: string, dto: UpsertOptionValueDto) {
    const template = await this.get(templateId);
    const value = await this.prisma.optionTemplateValue.create({
      data: {
        templateId,
        key: dto.key.trim(),
        swatchHex: dto.swatchHex?.trim() || null,
        swatchUrl: dto.swatchUrl?.trim() || null,
        order: dto.order ?? template.values.length,
        translations: { create: dto.translations.map((t) => ({ locale: t.locale, label: t.label.trim() })) },
      },
      include: { translations: true },
    });

    await this.audit.record({
      actorId,
      action: 'catalog.option_template_value_added',
      entity: 'OptionTemplate',
      entityId: templateId,
      data: { valueKey: value.key },
    });

    return value;
  }

  async deleteValue(actorId: string, valueId: string): Promise<void> {
    const value = await this.prisma.optionTemplateValue.findUnique({ where: { id: valueId } });
    if (!value) throw new NotFoundException('That value no longer exists.');

    await this.prisma.optionTemplateValue.delete({ where: { id: valueId } });
    await this.audit.record({
      actorId,
      action: 'catalog.option_template_value_deleted',
      entity: 'OptionTemplate',
      entityId: value.templateId,
      data: { valueKey: value.key },
    });
  }

  async delete(actorId: string, id: string): Promise<void> {
    const template = await this.get(id);
    await this.prisma.optionTemplate.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'catalog.option_template_deleted',
      entity: 'OptionTemplate',
      entityId: id,
      data: { key: template.key },
    });
  }
}
