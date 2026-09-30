import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@newax/shared';
import { Public } from '../../../core/auth/decorators';
import { CatalogService } from './catalog.service';
import { ProductQueryDto } from './dto/product-query.dto';

@ApiTags('catalog')
@Controller('catalog')
@Public()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Category tree in one locale' })
  categories(@Query('locale') locale?: string) {
    return this.catalog.listCategories(toLocale(locale));
  }

  @Get('products')
  @ApiOperation({ summary: 'Browse active products with filters and paging' })
  products(@Query() query: ProductQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get('facets')
  @ApiOperation({ summary: 'Available fabrics, seasons, piece counts and price range' })
  facets() {
    return this.catalog.getFilterFacets();
  }

  @Get('stitching-services')
  @ApiOperation({ summary: 'Stitching services, optionally for one garment type' })
  stitchingServices(
    @Query('garmentType') garmentType?: string,
    @Query('locale') locale?: string,
  ) {
    return this.catalog.listStitchingServices(garmentType, toLocale(locale));
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'One product by slug' })
  product(@Param('slug') slug: string, @Query('locale') locale?: string) {
    return this.catalog.getProductBySlug(slug, toLocale(locale));
  }
}

function toLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
