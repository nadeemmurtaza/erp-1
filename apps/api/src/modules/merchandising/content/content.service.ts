import { Injectable, NotFoundException } from '@nestjs/common';
import { pickTranslation } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '../../../core/prisma/client';
import { validateAndSanitizeBlocks } from './content-sanitizer';
import type {
  CreateBannerDto,
  CreateBlogPostDto,
  CreateMenuItemDto,
  CreatePageDto,
  UpdateBannerDto,
  UpdateBlogPostDto,
  UpdateMenuItemDto,
  UpdatePageDto,
} from './dto/content.dto';

const pageInclude = { translations: true } satisfies Prisma.PageInclude;
const postInclude = { translations: true } satisfies Prisma.BlogPostInclude;
const bannerInclude = { translations: true } satisfies Prisma.BannerInclude;
const menuItemInclude = { translations: true } satisfies Prisma.MenuItemInclude;

/**
 * WO-8.1. Every translation write goes through validateAndSanitizeBlocks()
 * first — a richtext block's html is never trusted, on create or update.
 */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Pages (admin) ----------------------------------------------------

  listPages() {
    return this.prisma.page.findMany({ include: pageInclude, orderBy: { updatedAt: 'desc' } });
  }

  async getPage(id: string) {
    const page = await this.prisma.page.findUnique({ where: { id }, include: pageInclude });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  async createPage(dto: CreatePageDto) {
    return this.prisma.page.create({
      data: {
        slug: dto.slug,
        template: dto.template ?? 'default',
        status: dto.status,
        noindex: dto.noindex,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            body: validateAndSanitizeBlocks(t.body) as unknown as Prisma.InputJsonValue,
            metaTitle: t.metaTitle,
            metaDescription: t.metaDescription,
            ogImageUrl: t.ogImageUrl,
          })),
        },
      },
      include: pageInclude,
    });
  }

  async updatePage(id: string, dto: UpdatePageDto) {
    await this.getPage(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const t of dto.translations) {
          await tx.pageTranslation.upsert({
            where: { pageId_locale: { pageId: id, locale: t.locale } },
            create: {
              pageId: id,
              locale: t.locale,
              title: t.title,
              body: validateAndSanitizeBlocks(t.body) as unknown as Prisma.InputJsonValue,
              metaTitle: t.metaTitle,
              metaDescription: t.metaDescription,
              ogImageUrl: t.ogImageUrl,
            },
            update: {
              title: t.title,
              body: validateAndSanitizeBlocks(t.body) as unknown as Prisma.InputJsonValue,
              metaTitle: t.metaTitle,
              metaDescription: t.metaDescription,
              ogImageUrl: t.ogImageUrl,
            },
          });
        }
      }
      return tx.page.update({
        where: { id },
        data: {
          template: dto.template,
          status: dto.status,
          noindex: dto.noindex,
          publishedAt: dto.status === 'PUBLISHED' ? new Date() : undefined,
        },
        include: pageInclude,
      });
    });
  }

  async deletePage(id: string): Promise<void> {
    await this.getPage(id);
    await this.prisma.page.delete({ where: { id } });
  }

  // --- Pages (public) -----------------------------------------------------

  async getPublishedPageBySlug(slug: string, locale: string) {
    const page = await this.prisma.page.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: pageInclude,
    });
    if (!page) throw new NotFoundException('Page not found');
    return { ...page, translation: pickTranslation(page.translations, locale) };
  }

  /** For sitemap.ts — every indexable, published slug. */
  listIndexablePageSlugs() {
    return this.prisma.page.findMany({
      where: { status: 'PUBLISHED', noindex: false },
      select: { slug: true, updatedAt: true },
    });
  }

  // --- Blog posts (admin) -------------------------------------------------

  listPosts() {
    return this.prisma.blogPost.findMany({ include: postInclude, orderBy: { updatedAt: 'desc' } });
  }

  async getPost(id: string) {
    const post = await this.prisma.blogPost.findUnique({ where: { id }, include: postInclude });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  async createPost(dto: CreateBlogPostDto, authorId: string | null) {
    return this.prisma.blogPost.create({
      data: {
        slug: dto.slug,
        status: dto.status,
        category: dto.category,
        tags: dto.tags ?? [],
        heroImageUrl: dto.heroImageUrl,
        noindex: dto.noindex,
        authorId,
        translations: {
          create: dto.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            body: validateAndSanitizeBlocks(t.body) as unknown as Prisma.InputJsonValue,
            excerpt: t.excerpt,
            metaTitle: t.metaTitle,
            metaDescription: t.metaDescription,
            ogImageUrl: t.ogImageUrl,
          })),
        },
      },
      include: postInclude,
    });
  }

  async updatePost(id: string, dto: UpdateBlogPostDto) {
    await this.getPost(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const t of dto.translations) {
          await tx.blogPostTranslation.upsert({
            where: { blogPostId_locale: { blogPostId: id, locale: t.locale } },
            create: {
              blogPostId: id,
              locale: t.locale,
              title: t.title,
              body: validateAndSanitizeBlocks(t.body) as unknown as Prisma.InputJsonValue,
              excerpt: t.excerpt,
              metaTitle: t.metaTitle,
              metaDescription: t.metaDescription,
              ogImageUrl: t.ogImageUrl,
            },
            update: {
              title: t.title,
              body: validateAndSanitizeBlocks(t.body) as unknown as Prisma.InputJsonValue,
              excerpt: t.excerpt,
              metaTitle: t.metaTitle,
              metaDescription: t.metaDescription,
              ogImageUrl: t.ogImageUrl,
            },
          });
        }
      }
      return tx.blogPost.update({
        where: { id },
        data: {
          category: dto.category,
          tags: dto.tags,
          heroImageUrl: dto.heroImageUrl,
          noindex: dto.noindex,
          status: dto.status,
          publishedAt: dto.status === 'PUBLISHED' ? new Date() : undefined,
        },
        include: postInclude,
      });
    });
  }

  async deletePost(id: string): Promise<void> {
    await this.getPost(id);
    await this.prisma.blogPost.delete({ where: { id } });
  }

  // --- Blog posts (public) -------------------------------------------------

  async listPublishedPosts(locale: string, page: number, pageSize: number) {
    const where: Prisma.BlogPostWhereInput = { status: 'PUBLISHED' };
    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        include: postInclude,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.blogPost.count({ where }),
    ]);
    return {
      data: rows.map((post) => ({ ...post, translation: pickTranslation(post.translations, locale) })),
      total,
    };
  }

  async getPublishedPostBySlug(slug: string, locale: string) {
    const post = await this.prisma.blogPost.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: { ...postInclude, author: { select: { firstName: true, lastName: true } } },
    });
    if (!post) throw new NotFoundException('Post not found');
    return { ...post, translation: pickTranslation(post.translations, locale) };
  }

  listIndexablePostSlugs() {
    return this.prisma.blogPost.findMany({
      where: { status: 'PUBLISHED', noindex: false },
      select: { slug: true, updatedAt: true },
    });
  }

  // --- Banners --------------------------------------------------------------

  listBanners(placementKey?: string) {
    return this.prisma.banner.findMany({
      where: placementKey ? { placementKey } : undefined,
      include: bannerInclude,
      orderBy: [{ placementKey: 'asc' }, { order: 'asc' }],
    });
  }

  async getBanner(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id }, include: bannerInclude });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  createBanner(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: {
        placementKey: dto.placementKey,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        translations: { create: dto.translations },
      },
      include: bannerInclude,
    });
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    await this.getBanner(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const t of dto.translations) {
          await tx.bannerTranslation.upsert({
            where: { bannerId_locale: { bannerId: id, locale: t.locale } },
            create: { bannerId: id, ...t },
            update: t,
          });
        }
      }
      return tx.banner.update({
        where: { id },
        data: {
          imageUrl: dto.imageUrl,
          linkUrl: dto.linkUrl,
          order: dto.order,
          isActive: dto.isActive,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
        include: bannerInclude,
      });
    });
  }

  async deleteBanner(id: string): Promise<void> {
    await this.getBanner(id);
    await this.prisma.banner.delete({ where: { id } });
  }

  /** Public: a placement's active, in-schedule banners, in display order. */
  async listActiveBanners(placementKey: string, locale: string) {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        placementKey,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: bannerInclude,
      orderBy: { order: 'asc' },
    });
    return banners.map((b) => ({ ...b, translation: pickTranslation(b.translations, locale) }));
  }

  // --- Menu items -------------------------------------------------------

  listMenuItems(menuKey?: string) {
    return this.prisma.menuItem.findMany({
      where: menuKey ? { menuKey } : undefined,
      include: menuItemInclude,
      orderBy: [{ menuKey: 'asc' }, { order: 'asc' }],
    });
  }

  async getMenuItem(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id }, include: menuItemInclude });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  createMenuItem(dto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({
      data: {
        menuKey: dto.menuKey,
        parentId: dto.parentId,
        url: dto.url,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        translations: { create: dto.translations },
      },
      include: menuItemInclude,
    });
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto) {
    await this.getMenuItem(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const t of dto.translations) {
          await tx.menuItemTranslation.upsert({
            where: { menuItemId_locale: { menuItemId: id, locale: t.locale } },
            create: { menuItemId: id, ...t },
            update: t,
          });
        }
      }
      return tx.menuItem.update({
        where: { id },
        data: { url: dto.url, order: dto.order, isActive: dto.isActive },
        include: menuItemInclude,
      });
    });
  }

  async deleteMenuItem(id: string): Promise<void> {
    await this.getMenuItem(id);
    await this.prisma.menuItem.delete({ where: { id } });
  }

  /** Public: one named menu's active items, translated, parent-first. */
  async getMenu(menuKey: string, locale: string) {
    const items = await this.prisma.menuItem.findMany({
      where: { menuKey, isActive: true },
      include: menuItemInclude,
      orderBy: { order: 'asc' },
    });
    return items.map((item) => ({
      id: item.id,
      parentId: item.parentId,
      url: item.url,
      label: pickTranslation(item.translations, locale)?.label ?? item.url,
    }));
  }
}
