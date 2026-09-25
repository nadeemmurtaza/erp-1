import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DEFAULT_LOCALE, isLocale } from '@newax/shared';
import { Public, RequirePermission } from '../../core/auth/decorators';
import { CollectionsService } from './collections.service';
import {
  AddCollectionProductDto,
  CreateCollectionDto,
  ReorderCollectionProductsDto,
  UpdateCollectionDto,
} from './dto/collections.dto';

function resolveLocale(locale?: string): 'en' | 'ur' {
  return locale && isLocale(locale) ? locale : DEFAULT_LOCALE;
}

@ApiTags('admin/collections')
@Controller('admin/collections')
export class CollectionsAdminController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @RequirePermission('collections.view', 'collections.manage')
  list() {
    return this.collections.listCollections();
  }

  @Get(':id')
  @RequirePermission('collections.view', 'collections.manage')
  get(@Param('id') id: string) {
    return this.collections.getCollection(id);
  }

  @Post()
  @RequirePermission('collections.manage')
  create(@Body() dto: CreateCollectionDto) {
    return this.collections.createCollection(dto);
  }

  @Patch(':id')
  @RequirePermission('collections.manage')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collections.updateCollection(id, dto);
  }

  @Delete(':id')
  @RequirePermission('collections.manage')
  remove(@Param('id') id: string) {
    return this.collections.deleteCollection(id);
  }

  @Post(':id/products')
  @RequirePermission('collections.manage')
  addProduct(@Param('id') id: string, @Body() dto: AddCollectionProductDto) {
    return this.collections.addProduct(id, dto);
  }

  @Delete(':id/products/:productId')
  @RequirePermission('collections.manage')
  removeProduct(@Param('id') id: string, @Param('productId') productId: string) {
    return this.collections.removeProduct(id, productId);
  }

  @Patch(':id/products/reorder')
  @RequirePermission('collections.manage')
  reorder(@Param('id') id: string, @Body() dto: ReorderCollectionProductsDto) {
    return this.collections.reorderProducts(id, dto);
  }
}

@ApiTags('collections')
@Controller('collections')
@Public()
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(@Query('locale') locale?: string) {
    return this.collections.listPublished(resolveLocale(locale));
  }

  @Get(':slug')
  get(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '24',
  ) {
    return this.collections.getPublishedBySlug(
      slug,
      resolveLocale(locale),
      Number(page) || 1,
      Math.min(Number(pageSize) || 24, 100),
    );
  }
}
