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
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Roles } from '../../core/auth/decorators';
import { CategoryAdminService } from './category-admin.service';
import { AdminProductQueryDto } from './dto/product-query.dto';
import { UpsertCategoryDto } from './dto/category.dto';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductAdminService } from './product-admin.service';
import { ProductImportService } from './product-import.service';

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
@Roles('ADMIN', 'STAFF')
export class CatalogAdminController {
  constructor(
    private readonly products: ProductAdminService,
    private readonly categories: CategoryAdminService,
    private readonly importer: ProductImportService,
  ) {}

  // --- Products and services ------------------------------------------------

  @Get('products')
  @ApiOperation({ summary: 'All products, including drafts and archived ones' })
  listProducts(@Query() query: AdminProductQueryDto) {
    return this.products.list(query);
  }

  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Add a product, fabric or stitching service' })
  createProduct(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.products.create(user.id, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.id, id, dto);
  }

  @Delete('products/:id')
  @ApiOperation({ summary: 'Archive a product (never hard-deleted — orders cite it)' })
  archiveProduct(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.products.archive(user.id, id);
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
    return this.products.addImage(user.id, id, file, dto.alt);
  }

  @Patch('products/:id/images/order')
  @ApiOperation({ summary: 'Reorder images; the first becomes the thumbnail' })
  reorderImages(@Param('id') id: string, @Body() dto: ReorderImagesDto) {
    return this.products.reorderImages(id, dto.imageIds);
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

  // --- Bulk import ----------------------------------------------------------

  @Get('import/template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="yaseen-products-template.csv"')
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
  ) {
    if (!file) {
      throw new BadRequestException('Choose a CSV file to upload.');
    }
    return this.importer.import(user.id, file.buffer);
  }
}
