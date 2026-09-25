import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DEFAULT_LOCALE, isLocale } from '@newax/shared';
import { CurrentUser, Public, RequirePermission } from '../../core/auth/decorators';
import { ContentService } from './content.service';
import {
  CreateBannerDto,
  CreateBlogPostDto,
  CreateMenuItemDto,
  CreatePageDto,
  UpdateBannerDto,
  UpdateBlogPostDto,
  UpdateMenuItemDto,
  UpdatePageDto,
} from './dto/content.dto';

function resolveLocale(locale?: string): 'en' | 'ur' {
  return locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
}

/** WO-8.1 admin CRUD — pages, posts, banners, menus. */
@ApiTags('admin/content')
@Controller('admin/content')
export class ContentAdminController {
  constructor(private readonly content: ContentService) {}

  @Get('pages')
  @RequirePermission('content.view', 'content.manage')
  listPages() {
    return this.content.listPages();
  }

  @Get('pages/:id')
  @RequirePermission('content.view', 'content.manage')
  getPage(@Param('id') id: string) {
    return this.content.getPage(id);
  }

  @Post('pages')
  @RequirePermission('content.manage')
  createPage(@Body() dto: CreatePageDto) {
    return this.content.createPage(dto);
  }

  @Patch('pages/:id')
  @RequirePermission('content.manage')
  updatePage(@Param('id') id: string, @Body() dto: UpdatePageDto) {
    return this.content.updatePage(id, dto);
  }

  @Delete('pages/:id')
  @RequirePermission('content.manage')
  deletePage(@Param('id') id: string) {
    return this.content.deletePage(id);
  }

  @Get('posts')
  @RequirePermission('content.view', 'content.manage')
  listPosts() {
    return this.content.listPosts();
  }

  @Get('posts/:id')
  @RequirePermission('content.view', 'content.manage')
  getPost(@Param('id') id: string) {
    return this.content.getPost(id);
  }

  @Post('posts')
  @RequirePermission('content.manage')
  createPost(@Body() dto: CreateBlogPostDto, @CurrentUser('id') userId: string) {
    return this.content.createPost(dto, userId);
  }

  @Patch('posts/:id')
  @RequirePermission('content.manage')
  updatePost(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.content.updatePost(id, dto);
  }

  @Delete('posts/:id')
  @RequirePermission('content.manage')
  deletePost(@Param('id') id: string) {
    return this.content.deletePost(id);
  }

  @Get('banners')
  @RequirePermission('content.view', 'content.manage')
  listBanners(@Query('placement') placement?: string) {
    return this.content.listBanners(placement);
  }

  @Post('banners')
  @RequirePermission('content.manage')
  createBanner(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  @Patch('banners/:id')
  @RequirePermission('content.manage')
  updateBanner(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return this.content.updateBanner(id, dto);
  }

  @Delete('banners/:id')
  @RequirePermission('content.manage')
  deleteBanner(@Param('id') id: string) {
    return this.content.deleteBanner(id);
  }

  @Get('menu-items')
  @RequirePermission('content.view', 'content.manage')
  listMenuItems(@Query('menuKey') menuKey?: string) {
    return this.content.listMenuItems(menuKey);
  }

  @Post('menu-items')
  @RequirePermission('content.manage')
  createMenuItem(@Body() dto: CreateMenuItemDto) {
    return this.content.createMenuItem(dto);
  }

  @Patch('menu-items/:id')
  @RequirePermission('content.manage')
  updateMenuItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.content.updateMenuItem(id, dto);
  }

  @Delete('menu-items/:id')
  @RequirePermission('content.manage')
  deleteMenuItem(@Param('id') id: string) {
    return this.content.deleteMenuItem(id);
  }
}

/** WO-8.1 public reads — the storefront's CMS-driven pages, blog and banners. */
@ApiTags('content')
@Controller('content')
@Public()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** Indexable page slugs — sitemap.ts's own read, not a general listing. */
  @Get('pages')
  listPageSlugs() {
    return this.content.listIndexablePageSlugs();
  }

  @Get('pages/:slug')
  getPage(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.content.getPublishedPageBySlug(slug, resolveLocale(locale));
  }

  @Get('posts')
  listPosts(
    @Query('locale') locale?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '12',
  ) {
    return this.content.listPublishedPosts(
      resolveLocale(locale),
      Number(page) || 1,
      Math.min(Number(pageSize) || 12, 200),
    );
  }

  @Get('posts/:slug')
  getPost(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.content.getPublishedPostBySlug(slug, resolveLocale(locale));
  }

  @Get('banners')
  listBanners(@Query('placement') placement: string, @Query('locale') locale?: string) {
    return this.content.listActiveBanners(placement, resolveLocale(locale));
  }

  @Get('menu/:menuKey')
  getMenu(@Param('menuKey') menuKey: string, @Query('locale') locale?: string) {
    return this.content.getMenu(menuKey, resolveLocale(locale));
  }
}
