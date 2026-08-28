import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../core/auth/decorators';
import { PurchasingService } from './purchasing.service';
import { CreateSupplierDto, UpdateSupplierDto, AddSupplierProductDto } from './dto/supplier.dto';

@ApiTags('Purchasing Admin')
@Controller('admin/suppliers')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'List all suppliers' })
  async findAll() {
    return { data: await this.purchasing.findAll() };
  }

  @Get(':id')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Get a supplier' })
  async findOne(@Param('id') id: string) {
    return this.purchasing.findOne(id);
  }

  @Post()
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Create a supplier' })
  async create(@Body() dto: CreateSupplierDto) {
    return this.purchasing.create(dto);
  }

  @Patch(':id')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Update a supplier' })
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.purchasing.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Delete a supplier' })
  async remove(@Param('id') id: string) {
    // Note: Never hard-delete a supplier with history. History checks to be added in WO-1.5.
    return this.purchasing.remove(id);
  }

  @Get(':id/products')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Get products for a supplier' })
  async getProducts(@Param('id') id: string) {
    return { data: await this.purchasing.getProducts(id) };
  }

  @Post(':id/products')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Add a product to a supplier' })
  async addProduct(@Param('id') id: string, @Body() dto: AddSupplierProductDto) {
    return this.purchasing.addProduct(id, dto);
  }

  @Delete(':id/products/:variantId')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Remove a product from a supplier' })
  async removeProduct(@Param('id') id: string, @Param('variantId') variantId: string) {
    return this.purchasing.removeProduct(id, variantId);
  }
}


import { CurrentUser } from '../../core/auth/decorators';
import { CreatePurchaseOrderDto, ReceiveGoodsDto } from './dto/purchase-order.dto';

@ApiTags('Purchase Orders')
@Controller('admin/purchase-orders')
export class PurchaseOrderAdminController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Post()
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Create a purchase order' })
  async create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser('id') userId: string) {
    return this.purchasing.createPurchaseOrder(dto, userId);
  }

  @Post(':id/send')
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Mark a purchase order as sent' })
  async markSent(@Param('id') id: string) {
    return this.purchasing.markPurchaseOrderSent(id);
  }

  @Post(':id/receive')
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Receive goods against a purchase order' })
  async receiveGoods(@Param('id') id: string, @Body() dto: ReceiveGoodsDto, @CurrentUser('id') userId: string) {
    return this.purchasing.receiveGoods(id, dto, userId);
  }
}

