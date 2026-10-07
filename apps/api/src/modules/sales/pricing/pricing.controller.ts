import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { PricingService } from './pricing.service';
import {
  CreatePriceListDto,
  UpdatePriceListDto,
  SetPriceListAssignmentDto,
  PreviewPriceDto,
  BatchPreviewPriceDto,
} from './dto/pricing.dto';

@ApiTags('Pricing Admin — Price Lists')
@Controller('admin/pricing/price-lists')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermission('pricing.price-lists.manage')
  @ApiOperation({ summary: 'List every price list with its entries and assignments' })
  async findAll() {
    return { data: await this.pricing.listPriceLists() };
  }

  @Post()
  @RequirePermission('pricing.price-lists.manage')
  @ApiOperation({ summary: 'Create a price list — an entry below the variant\'s base price requires pricing.price-lists.approve' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePriceListDto) {
    return this.pricing.createPriceList(user, dto, user.permissions.includes('pricing.price-lists.approve'));
  }

  @Patch(':id')
  @RequirePermission('pricing.price-lists.manage')
  @ApiOperation({ summary: 'Update a price list\'s entries — same margin-decision gate as create' })
  async update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdatePriceListDto) {
    return this.pricing.updatePriceList(user, id, dto, user.permissions.includes('pricing.price-lists.approve'));
  }

  @Post(':id/assignments')
  @RequirePermission('pricing.assignments.manage')
  @ApiOperation({ summary: 'Assign a price list to a customer or a customer tag' })
  async assign(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: SetPriceListAssignmentDto) {
    await this.pricing.setAssignment(user, id, dto);
    return { assigned: true };
  }

  @Delete('assignments/:assignmentId')
  @RequirePermission('pricing.assignments.manage')
  @ApiOperation({ summary: 'Remove a price-list assignment' })
  async unassign(@CurrentUser() user: AuthenticatedUser, @Param('assignmentId') assignmentId: string) {
    await this.pricing.removeAssignment(user, assignmentId);
    return { removed: true };
  }

  @Post('preview')
  @RequirePermission('pricing.price-lists.manage')
  @ApiOperation({ summary: 'Preview one variant\'s resolved price for a customer at a quantity — a pure read, nothing written' })
  async preview(@Body() dto: PreviewPriceDto) {
    const unitPriceMinor = await this.pricing.resolvePrice(dto.variantId, dto.quantity, dto.customerId ?? null);
    return { unitPriceMinor };
  }

  @Post('preview/batch')
  @RequirePermission('pricing.price-lists.manage')
  @ApiOperation({ summary: 'Preview several variants at once — the same batched path checkout itself uses' })
  async previewBatch(@Body() dto: BatchPreviewPriceDto) {
    const resolved = await this.pricing.resolvePrices(dto.items, dto.customerId ?? null);
    return { prices: Object.fromEntries(resolved) };
  }
}
