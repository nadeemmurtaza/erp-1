import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { CreateOptionTemplateDto, CreateProductOptionDto, InstantiateTemplateDto, UpsertOptionValueDto } from './dto/option.dto';
import { OptionTemplateAdminService } from './option-template-admin.service';
import { ProductOptionAdminService } from './product-option-admin.service';

/**
 * WO-3.1 (03-variants-sku-seo.md) — the store-level option library and each
 * product's own option axes. Split from CatalogAdminController only because
 * that file is already the size it should be; same permission, same module.
 */
@ApiTags('admin/catalog')
@Controller('admin/catalog')
@RequirePermission('catalog.manage')
export class CatalogOptionsAdminController {
  constructor(
    private readonly templates: OptionTemplateAdminService,
    private readonly productOptions: ProductOptionAdminService,
  ) {}

  @Get('option-templates')
  @ApiOperation({ summary: 'Store-level reusable option axes (Catalogue -> Options & attributes)' })
  listTemplates() {
    return this.templates.list();
  }

  @Post('option-templates')
  @ApiOperation({ summary: 'Create a reusable option template' })
  createTemplate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOptionTemplateDto) {
    return this.templates.create(user.id, dto);
  }

  @Post('option-templates/:templateId/values')
  @ApiOperation({ summary: "Add a value to a template" })
  addTemplateValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId') templateId: string,
    @Body() dto: UpsertOptionValueDto,
  ) {
    return this.templates.addValue(user.id, templateId, dto);
  }

  @Delete('option-template-values/:valueId')
  @ApiOperation({ summary: 'Remove a template value' })
  deleteTemplateValue(@CurrentUser() user: AuthenticatedUser, @Param('valueId') valueId: string) {
    return this.templates.deleteValue(user.id, valueId);
  }

  @Delete('option-templates/:templateId')
  @ApiOperation({ summary: 'Delete a template' })
  deleteTemplate(@CurrentUser() user: AuthenticatedUser, @Param('templateId') templateId: string) {
    return this.templates.delete(user.id, templateId);
  }

  @Get('products/:productId/options')
  @ApiOperation({ summary: "A product's own option axes and values" })
  listProductOptions(@Param('productId') productId: string) {
    return this.productOptions.list(productId);
  }

  @Post('products/:productId/options')
  @ApiOperation({ summary: 'Add a custom option axis to a product' })
  createProductOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: CreateProductOptionDto,
  ) {
    return this.productOptions.create(user.id, productId, dto);
  }

  @Post('products/:productId/options/instantiate')
  @ApiOperation({ summary: 'Copy a store-level template onto this product' })
  instantiate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: InstantiateTemplateDto,
  ) {
    return this.productOptions.instantiateTemplate(user.id, productId, dto.templateId, dto.order);
  }

  @Post('options/:optionId/values')
  @ApiOperation({ summary: "Add a value to a product's option" })
  addProductOptionValue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('optionId') optionId: string,
    @Body() dto: UpsertOptionValueDto,
  ) {
    return this.productOptions.addValue(user.id, optionId, dto);
  }

  @Delete('option-values/:valueId')
  @ApiOperation({ summary: 'Remove a value — refused while a variant still uses it' })
  deleteProductOptionValue(@CurrentUser() user: AuthenticatedUser, @Param('valueId') valueId: string) {
    return this.productOptions.deleteValue(user.id, valueId);
  }

  @Delete('options/:optionId')
  @ApiOperation({ summary: 'Remove an option axis — refused while any of its values is in use' })
  deleteProductOption(@CurrentUser() user: AuthenticatedUser, @Param('optionId') optionId: string) {
    return this.productOptions.deleteOption(user.id, optionId);
  }
}
