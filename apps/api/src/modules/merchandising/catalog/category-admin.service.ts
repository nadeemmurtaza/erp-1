import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, slugifyWithFallback, uniqueSlug } from '@newax/shared';
import { AuditService } from '../../../core/audit/audit.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { UpsertCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    return this.prisma.category.findMany({
      include: {
        translations: true,
        _count: { select: { products: true, children: true } },
      },
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
    });
  }

  async get(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!category) throw new NotFoundException('That category no longer exists.');
    return category;
  }

  async create(actorId: string, dto: UpsertCategoryDto) {
    assertEnglish(dto);
    const slug = await this.resolveSlug(dto);

    const category = await this.prisma.category.create({
      data: {
        slug,
        parentId: dto.parentId || null,
        imageUrl: dto.imageUrl?.trim() || null,
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
      action: 'category.created',
      entity: 'Category',
      entityId: category.id,
      data: { slug },
    });

    return category;
  }

  async update(actorId: string, id: string, dto: UpsertCategoryDto) {
    await this.get(id);

    if (dto.parentId) {
      await this.assertNoCycle(id, dto.parentId);
    }

    const category = await this.prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id },
        data: {
          ...(dto.slug ? { slug: dto.slug } : {}),
          parentId: dto.parentId || null,
          imageUrl: dto.imageUrl?.trim() || null,
          ...(dto.order !== undefined ? { order: dto.order } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      for (const translation of dto.translations ?? []) {
        await tx.categoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: id, locale: translation.locale } },
          create: {
            categoryId: id,
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

      return tx.category.findUniqueOrThrow({
        where: { id },
        include: { translations: true },
      });
    });

    await this.audit.record({
      actorId,
      action: 'category.updated',
      entity: 'Category',
      entityId: id,
    });

    return category;
  }

  /**
   * Deletes a category only when nothing depends on it; otherwise the caller is
   * told to move the products first rather than losing them silently.
   */
  async remove(actorId: string, id: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw new NotFoundException('That category no longer exists.');

    if (category._count.products > 0) {
      throw new BadRequestException(
        `This category still holds ${category._count.products} product(s). Move them first, or deactivate the category instead.`,
      );
    }
    if (category._count.children > 0) {
      throw new BadRequestException('Remove or move the sub-categories first.');
    }

    await this.prisma.category.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'category.deleted',
      entity: 'Category',
      entityId: id,
      data: { slug: category.slug },
    });
  }

  /** Walks up the tree so a category can never become its own ancestor. */
  private async assertNoCycle(id: string, parentId: string): Promise<void> {
    if (id === parentId) {
      throw new BadRequestException('A category cannot be its own parent.');
    }

    let cursor: string | null = parentId;
    const seen = new Set<string>([id]);

    while (cursor) {
      if (seen.has(cursor)) {
        throw new BadRequestException('That would create a loop in the category tree.');
      }
      seen.add(cursor);

      const parent: { parentId: string | null } | null =
        await this.prisma.category.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }

  private async resolveSlug(dto: UpsertCategoryDto): Promise<string> {
    const english = dto.translations.find((row) => row.locale === DEFAULT_LOCALE);
    const base = slugifyWithFallback(dto.slug ?? english?.name ?? '', 'category');

    const clashes = await this.prisma.category.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });

    return uniqueSlug(
      base,
      clashes.map((row) => row.slug),
    );
  }
}

function assertEnglish(dto: UpsertCategoryDto): void {
  if (!dto.translations?.some((row) => row.locale === DEFAULT_LOCALE)) {
    throw new BadRequestException('An English name is required for every category.');
  }
}
