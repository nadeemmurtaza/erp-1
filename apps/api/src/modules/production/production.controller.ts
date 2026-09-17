import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission, CurrentUser } from '../../core/auth/decorators';
import { BomService } from './bom.service';
import { WorkOrdersService } from './work-orders.service';
import { UpsertBillOfMaterialDto } from './dto/bom.dto';
import { CreateWorkOrderDto, CompleteWorkOrderDto } from './dto/work-order.dto';
import type { WorkOrderStatus } from '../../core/prisma/client';

@ApiTags('Production Admin')
@Controller('admin/production/boms')
export class BomController {
  constructor(private readonly boms: BomService) {}

  @Get(':variantId')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: "Get a variant's bill of materials" })
  async getForVariant(@Param('variantId') variantId: string) {
    return this.boms.getForVariant(variantId);
  }

  @Post(':variantId')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: "Create or replace a variant's bill of materials" })
  async upsert(@Param('variantId') variantId: string, @Body() dto: UpsertBillOfMaterialDto) {
    return this.boms.upsert(variantId, dto);
  }

  @Delete(':variantId')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: "Delete a variant's bill of materials" })
  async remove(@Param('variantId') variantId: string) {
    return this.boms.remove(variantId);
  }
}

@ApiTags('Production Admin')
@Controller('admin/production/work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  @RequirePermission('production.manage')
  @ApiOperation({ summary: 'List work orders' })
  async findAll(@Query('status') status?: WorkOrderStatus) {
    return { data: await this.workOrders.list(status) };
  }

  @Get(':id')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: 'Get a work order' })
  async findOne(@Param('id') id: string) {
    return this.workOrders.get(id);
  }

  @Post()
  @RequirePermission('production.manage')
  @ApiOperation({ summary: 'Open a DRAFT work order' })
  async create(@Body() dto: CreateWorkOrderDto, @CurrentUser('id') userId: string) {
    return this.workOrders.createFromDto(dto, userId);
  }

  @Post(':id/release')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: 'Release a work order, consuming its bill of materials' })
  async release(@Param('id') id: string) {
    return this.workOrders.release(id);
  }

  @Post(':id/complete')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: 'Complete a work order, crediting finished stock' })
  async complete(@Param('id') id: string, @Body() dto: CompleteWorkOrderDto) {
    return this.workOrders.complete(id, dto.quantityCompleted);
  }

  @Post(':id/cancel')
  @RequirePermission('production.manage')
  @ApiOperation({ summary: 'Cancel a work order' })
  async cancel(@Param('id') id: string) {
    return this.workOrders.cancel(id);
  }
}
