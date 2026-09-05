import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, slugifyWithFallback, uniqueSlug } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { UpsertBrandDto } from './dto/brand.dto';

/**
 * The managed list of brands.
 *
 * Deliberately the same shape as CategoryAdminService — slug resolution,
 * bilingual translations, a delete that refuses while products still point at
 * the row. A brand behaves like a category from the catalogue's point of
 * view, so it should not need its own vocabulary.
 */
@Injectable()
export class BrandAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.brand.findMany({
      include: {
        translations: true,
        _count: { select: { products: true } },
      },
      orderBy: [{ order: 'asc' }, { slug: 'asc' }],
    });
  }

  async get(id: string) {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!brand) throw new NotFoundException('That brand no longer exists.');
    return brand;
  }

  async create(actorId: string, dto: UpsertBrandDto) {
    assertEnglish(dto);
    const slug = await this.resolveSlug(dto);

    const brand = await this.prisma.brand.create({
      data: {
        slug,
        logoUrl: dto.logoUrl?.trim() || null,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        translations: {
          create: dto.translations.map((translation) => ({
            locale: translation.locale,
            name: translation.name.trim(),
            description: translation.description?.trim() || null,
          })),
        },
      },
      include: { translations: true },
    });

    await this.audit.record({
      actorId,
      action: 'brand.created',
      entity: 'Brand',
      entityId: brand.id,
      data: { slug },
    });

    return brand;
  }

  async update(actorId: string, id: string, dto: UpsertBrandDto) {
    await this.get(id);

    const brand = await this.prisma.$transaction(async (tx) => {
      await tx.brand.update({
        where: { id },
        data: {
          ...(dto.slug ? { slug: dto.slug } : {}),
          logoUrl: dto.logoUrl?.trim() || null,
          ...(dto.order !== undefined ? { order: dto.order } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      for (const translation of dto.translations ?? []) {
        await tx.brandTranslation.upsert({
          where: { brandId_locale: { brandId: id, locale: translation.locale } },
          create: {
            brandId: id,
            locale: translation.locale,
            name: translation.name.trim(),
            description: translation.description?.trim() || null,
          },
          update: {
            name: translation.name.trim(),
            description: translation.description?.trim() || null,
          },
        });
      }

      return tx.brand.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });

    await this.audit.record({
      actorId,
      action: 'brand.updated',
      entity: 'Brand',
      entityId: id,
    });

    return brand;
  }

  /**
   * Refuses while products still carry the brand.
   *
   * The foreign key is ON DELETE SET NULL, so deleting anyway would silently
   * blank the brand on every one of them — recoverable only from a backup.
   * Deactivating hides it from pickers without touching the products.
   */
  async remove(actorId: string, id: string): Promise<void> {
    const brand = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw new NotFoundException('That brand no longer exists.');

    if (brand._count.products > 0) {
      throw new BadRequestException(
        `${brand._count.products} product(s) still use this brand. Move them first, or deactivate the brand instead.`,
      );
    }

    await this.prisma.brand.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'brand.deleted',
      entity: 'Brand',
      entityId: id,
      data: { slug: brand.slug },
    });
  }

  private async resolveSlug(dto: UpsertBrandDto): Promise<string> {
    const english = dto.translations.find((row) => row.locale === DEFAULT_LOCALE);
    const base = slugifyWithFallback(dto.slug ?? english?.name ?? '', 'brand');

    const clashes = await this.prisma.brand.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });

    return uniqueSlug(
      base,
      clashes.map((row) => row.slug),
    );
  }
}

function assertEnglish(dto: UpsertBrandDto): void {
  if (!dto.translations?.some((row) => row.locale === DEFAULT_LOCALE)) {
    throw new BadRequestException('An English name is required for every brand.');
  }
}
