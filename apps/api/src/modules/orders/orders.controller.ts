import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@yaseen/shared';
import { CART_COOKIE, type AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Public, RequirePermission } from '../../core/auth/decorators';
import {
  AddShipmentDto,
  AdminOrderQueryDto,
  ChangeOrderStatusDto,
  OrderHistoryQueryDto,
  PlaceOrderDto,
  TrackOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Place the order in the current cart' })
  async place(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: PlaceOrderDto,
    @Query('locale') locale?: string,
  ) {
    const order = await this.orders.place(cartToken(request), user?.id, dto, toLocale(locale));
    for (const item of order.items) {
      delete (item as any).unitCost;
    }
    return order;
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in customer's orders" })
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderHistoryQueryDto) {
    const result = await this.orders.listForUser(user.id, query.page, query.pageSize);
    for (const order of result.data) {
      for (const item of order.items) {
        delete (item as any).unitCost;
      }
    }
    return result;
  }

  @Get(':number')
  @ApiOperation({ summary: 'One order, for its owner' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    const order = await this.orders.findByNumber(number, user.id);
    for (const item of order.items) {
      delete (item as any).unitCost;
    }
    return order;
  }

  @Public()
  @Post(':number/track')
  @ApiOperation({
    summary: 'Track a guest order with the phone number it was placed with',
  })
  async track(@Param('number') number: string, @Body() dto: TrackOrderDto) {
    const order = await this.orders.findByNumber(number, undefined, dto.phone);
    for (const item of order.items) {
      delete (item as any).unitCost;
    }
    return order;
  }
}

@ApiTags('admin/orders')
@Controller('admin/orders')
@RequirePermission('orders.manage')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'All orders, filterable by status' })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: AdminOrderQueryDto) {
    const result = await this.orders.adminList({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      q: query.q,
      status: query.status,
    });

    if (!user.permissions.includes('inventory.view_cost')) {
      for (const order of result.data) {
        for (const item of order.items) {
          delete (item as any).unitCost;
        }
      }
    }
    return result;
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const order = await this.orders.adminGet(id);
    if (!user.permissions.includes('inventory.view_cost')) {
      for (const item of order.items) {
        delete (item as any).unitCost;
      }
    }
    return order;
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Move the order along; cancelling restores stock' })
  async changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeOrderStatusDto,
  ) {
    const order = await this.orders.changeStatus(user.id, id, dto.status, dto.note);
    if (!user.permissions.includes('inventory.view_cost')) {
      for (const item of order.items) {
        delete (item as any).unitCost;
      }
    }
    return order;
  }

  @Post(':id/shipments')
  @ApiOperation({ summary: 'Record a dispatch and its tracking number' })
  addShipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddShipmentDto,
  ) {
    return this.orders.addShipment(user.id, id, {
      courier: dto.courier ?? 'manual',
      trackingNumber: dto.trackingNumber,
      trackingUrl: dto.trackingUrl,
    });
  }
}

function cartToken(request: Request): string | undefined {
  const header = request.header('x-cart-token');
  if (header) return header;

  const cookie = request.cookies?.[CART_COOKIE];
  return typeof cookie === 'string' ? cookie : undefined;
}

function toLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
