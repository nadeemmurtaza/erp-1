import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ContentService } from './content.service';

describe('ContentService', () => {
  let service: ContentService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [ContentService, PrismaService],
    }).compile();
    service = module.get(ContentService);
    prisma = module.get(PrismaService);
  });

  let seq = 0;
  function slug(prefix: string): string {
    seq += 1;
    return `${prefix}-content-test-${Date.now()}-${seq}`;
  }

  afterEach(async () => {
    await prisma.page.deleteMany({ where: { slug: { contains: 'content-test' } } });
    await prisma.blogPost.deleteMany({ where: { slug: { contains: 'content-test' } } });
    await prisma.banner.deleteMany({ where: { placementKey: 'homepage_hero', imageUrl: { contains: 'content-test' } } });
    await prisma.menuItem.deleteMany({ where: { url: { contains: 'content-test' } } });
  });

  describe('pages', () => {
    it('sanitises a richtext block on create, stripping a script tag', async () => {
      const s = slug('page');
      const page = await service.createPage({
        slug: s,
        translations: [
          {
            locale: 'en',
            title: 'About us',
            body: [{ type: 'richtext', html: '<p>Hello</p><script>alert(1)</script>' }],
          },
        ],
      });

      const translation = page.translations[0]!;
      const body = translation.body as unknown as { type: string; html: string }[];
      expect(body[0]!.html).toBe('<p>Hello</p>');
    });

    it('rejects a block with no known type', async () => {
      await expect(
        service.createPage({
          slug: slug('page'),
          translations: [{ locale: 'en', title: 'Bad', body: [{ type: 'nonsense' }] }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets publishedAt when a page is moved to PUBLISHED', async () => {
      const page = await service.createPage({
        slug: slug('page'),
        translations: [{ locale: 'en', title: 'Draft', body: [] }],
      });
      expect(page.publishedAt).toBeNull();

      const updated = await service.updatePage(page.id, { status: 'PUBLISHED' });
      expect(updated.publishedAt).not.toBeNull();
    });

    it('serves a published page by slug with locale fallback', async () => {
      const s = slug('page');
      await service.createPage({
        slug: s,
        status: 'PUBLISHED',
        translations: [{ locale: 'en', title: 'English only', body: [] }],
      });

      const result = await service.getPublishedPageBySlug(s, 'ur');
      expect(result.translation?.title).toBe('English only');
    });

    it('never serves a DRAFT page publicly', async () => {
      const s = slug('page');
      await service.createPage({
        slug: s,
        translations: [{ locale: 'en', title: 'Draft', body: [] }],
      });
      await expect(service.getPublishedPageBySlug(s, 'en')).rejects.toThrow(NotFoundException);
    });

    it('throws on an unknown page id', async () => {
      await expect(service.getPage('does-not-exist')).rejects.toThrow(NotFoundException);
    });
  });

  describe('banners', () => {
    it('excludes a banner outside its schedule window', async () => {
      const s = slug('banner');
      const past = new Date(Date.now() - 10 * 24 * 60 * 60_000);
      const alsoPast = new Date(Date.now() - 5 * 24 * 60 * 60_000);
      await service.createBanner({
        placementKey: 'homepage_hero',
        imageUrl: `https://example.com/${s}.jpg`,
        startsAt: past.toISOString(),
        endsAt: alsoPast.toISOString(),
        translations: [{ locale: 'en', altText: 'Expired banner' }],
      });

      const active = await service.listActiveBanners('homepage_hero', 'en');
      expect(active.some((b) => b.imageUrl.includes(s))).toBe(false);
    });

    it('includes an always-on banner with no schedule', async () => {
      const s = slug('banner');
      await service.createBanner({
        placementKey: 'homepage_hero',
        imageUrl: `https://example.com/${s}.jpg`,
        translations: [{ locale: 'en', altText: 'Always on' }],
      });

      const active = await service.listActiveBanners('homepage_hero', 'en');
      expect(active.some((b) => b.imageUrl.includes(s))).toBe(true);
    });
  });

  describe('menu items', () => {
    it('resolves a label with locale fallback to the default locale', async () => {
      const url = `/pages/content-test-${Date.now()}`;
      await service.createMenuItem({
        menuKey: 'footer_help',
        url,
        translations: [{ locale: 'en', label: 'Contact us' }],
      });

      const menu = await service.getMenu('footer_help', 'ur');
      expect(menu.find((item) => item.url === url)?.label).toBe('Contact us');
    });
  });
});
