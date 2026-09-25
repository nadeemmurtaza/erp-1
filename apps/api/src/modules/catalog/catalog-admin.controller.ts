import { BRAND } from '@newax/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { BrandAdminService } from './brand-admin.service';
import { CategoryAdminService } from './category-admin.service';
import { AdminProductQueryDto } from './dto/product-query.dto';
import { UpsertBrandDto } from './dto/brand.dto';
import { UpsertCategoryDto } from './dto/category.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductAdminService } from './product-admin.service';
import { ProductImportService } from './product-import.service';
import { SeoHealthService } from './seo-health.service';
import { stripProductCost, stripProductListCost } from '../../core/common/cost-fields';

class ReorderImagesDto {
  @IsArray()
  @IsString({ each: true })
  imageIds!: string[];
}

class UpdateStockDto {
  @IsInt()
  @Min(0)
  stock!: number;
}

class AddImageDto {
  @IsOptional()
  @IsString()
  alt?: string;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

class UpdateImageDto {
  @IsString()
  alt!: string;

  @ApiPropertyOptional({ default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;
}

/** Uploaded file as Multer hands it over. */
interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('admin/catalog')
@Controller('admin/catalog')
@RequirePermission('catalog.manage')
export class CatalogAdminController {
  constructor(
    private readonly products: ProductAdminService,
    private readonly categories: CategoryAdminService,
    private readonly brands: BrandAdminService,
    private readonly importer: ProductImportService,
    private readonly seoHealth: SeoHealthService,
  ) {}

  // --- Products and services ------------------------------------------------

  @Get('products')
  @ApiOperation({ summary: 'All products, including drafts and archived ones' })
  async listProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AdminProductQueryDto,
  ) {
    return stripProductListCost(await this.products.list(query), user);
  }

  @Get('products/seo-health')
  @ApiOperation({ summary: 'Every product failing the SEO publish gate, worst first' })
  seoHealthList() {
    return this.seoHealth.list();
  }

  @Get('products/:id/publish-gate')
  @ApiOperation({ summary: "A product's own completeness against the publish gate" })
  publishGate(@Param('id') id: string) {
    return this.products.checkPublishGate(id);
  }

  @Get('products/:id')
  async getProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripProductCost(await this.products.get(id), user);
  }

  @Post('products')
  @ApiOperation({ summary: 'Add a product, fabric or stitching service' })
  async createProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return stripProductCost(await this.products.create(user.id, dto), user);
  }

  @Patch('products/:id')
  async updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return stripProductCost(await this.products.update(user.id, id, dto), user);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Archive a product (never hard-deleted — orders cite it)' })
  async archiveProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripProductCost(await this.products.archive(user.id, id), user);
  }

  // --- Images ---------------------------------------------------------------

  @Post('products/:id/images')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        alt: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a product image' })
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImage | undefined,
    @Body() dto: AddImageDto,
  ) {
    if (!file) {
      throw new BadRequestException('Choose an image file to upload.');
    }
    return this.products.addImage(user.id, id, file, dto.alt, dto.locale);
  }

  @Patch('products/:id/images/order')
  @ApiOperation({ summary: 'Reorder images; the first becomes the thumbnail' })
  reorderImages(@Param('id') id: string, @Body() dto: ReorderImagesDto) {
    return this.products.reorderImages(id, dto.imageIds);
  }

  @Patch('images/:imageId')
  @ApiOperation({ summary: 'Edit an image\'s alt text' })
  updateImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId') imageId: string,
    @Body() dto: UpdateImageDto,
  ) {
    return this.products.updateImageAlt(user.id, imageId, dto.alt, dto.locale);
  }

  @Delete('images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteImage(@Param('imageId') imageId: string) {
    return this.products.deleteImage(imageId);
  }

  // --- Stock ----------------------------------------------------------------

  @Patch('variants/:variantId/stock')
  @ApiOperation({ summary: 'Set the stock level of one variant' })
  updateStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.products.updateStock(user.id, variantId, dto.stock);
  }

  // --- Categories -----------------------------------------------------------

  @Get('categories')
  listCategories() {
    return this.categories.list();
  }

  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertCategoryDto) {
    return this.categories.create(user.id, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertCategoryDto,
  ) {
    return this.categories.update(user.id, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.categories.remove(user.id, id);
  }

  // --- Brands ---------------------------------------------------------------

  @Get('brands')
  listBrands() {
    return this.brands.list();
  }

  @Post('brands')
  createBrand(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertBrandDto) {
    return this.brands.create(user.id, dto);
  }

  @Patch('brands/:id')
  updateBrand(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertBrandDto,
  ) {
    return this.brands.update(user.id, id, dto);
  }

  @Delete('brands/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBrand(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.brands.remove(user.id, id);
  }

  // --- Bulk import ----------------------------------------------------------

  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    `attachment; filename="${BRAND.identity.domain.split('.')[0]}-products-template.csv"`,
  )
  @ApiOperation({ summary: 'Download the CSV template for bulk product upload' })
  importTemplate(): string {
    return this.importer.template();
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bulk create or update products from a CSV file' })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: UploadedImage | undefined,
    @Query('dryRun') dryRun?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Choose a CSV file to upload.');
    }
    return this.importer.import(user.id, file.buffer, { dryRun: dryRun === 'true' });
  }
}
