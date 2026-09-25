import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, RequirePermission } from '../../core/auth/decorators';
import { RecommendationsService } from './recommendations.service';
import { AddCrossSellDto, ReorderCrossSellsDto } from './dto/recommendations.dto';

@ApiTags('catalog')
@Controller('catalog/products')
@Public()
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get(':slug/related')
  @ApiOperation({ summary: 'WO-9.6 — related products / "complete the look" (manual > co-occurrence > embedding)' })
  related(@Param('slug') slug: string) {
    return this.recommendations.relatedForSlug(slug);
  }

  @Get(':slug/frequently-bought-together')
  @ApiOperation({ summary: 'WO-9.6 — co-occurrence only, for the bundle widget' })
  async frequentlyBoughtTogether(@Param('slug') slug: string) {
    return { slugs: await this.recommendations.frequentlyBoughtWithSlug(slug) };
  }
}

@ApiTags('catalog')
@Controller('catalog/recommendations')
@Public()
export class PersonalizedRecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('personalized')
  @ApiOperation({ summary: 'WO-9.6 — "personalised homepage from browse... history", by anonymous session id' })
  async personalized(@Query('sessionId') sessionId: string | undefined) {
    return { slugs: await this.recommendations.personalizedFor(sessionId ?? '') };
  }
}

@ApiTags('admin/catalog')
@Controller('admin/catalog/products/:id/cross-sells')
@RequirePermission('catalog.manage')
export class CrossSellAdminController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @ApiOperation({ summary: 'WO-9.6 — every cross-sell for this product, manual and algorithmic alike' })
  list(@Param('id') productId: string) {
    return this.recommendations.listCrossSells(productId);
  }

  @Post()
  @ApiOperation({ summary: 'WO-9.6 — add (or promote to) a manual cross-sell — "a merchandiser\'s curated pairing beats the algorithm"' })
  add(@Param('id') productId: string, @Body() dto: AddCrossSellDto) {
    return this.recommendations.addManualCrossSell(productId, dto.relatedProductId);
  }

  @Patch('order')
  @ApiOperation({ summary: 'WO-9.6 — reorder this product\'s manual cross-sells' })
  async reorder(@Param('id') productId: string, @Body() dto: ReorderCrossSellsDto) {
    await this.recommendations.reorderManualCrossSells(productId, dto.relatedProductIds);
  }

  @Delete(':relatedProductId')
  @ApiOperation({ summary: 'WO-9.6 — remove a cross-sell (manual or algorithmic)' })
  async remove(@Param('id') productId: string, @Param('relatedProductId') relatedProductId: string) {
    await this.recommendations.removeCrossSell(productId, relatedProductId);
  }
}
