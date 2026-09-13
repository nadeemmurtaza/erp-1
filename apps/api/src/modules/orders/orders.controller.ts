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
import { DEFAULT_LOCALE, isLocale, type Locale } from '@newax/shared';
import {
  CART_COOKIE,
  LEGACY_CART_COOKIE,
  readCookie,
  type AuthenticatedUser,
} from '../../core/auth/auth.constants';
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
import { stripOrderCost, stripOrderListCost } from '../../core/common/cost-fields';

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
    // Cost is never exposed to customers -- strip unconditionally (requirePermission=false).
    return stripOrderCost(
      await this.orders.place(cartToken(request), user?.id, dto, toLocale(locale)),
      user,
      false,
    );
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in customer's orders" })
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderHistoryQueryDto) {
    return stripOrderListCost(
      await this.orders.listForUser(user.id, query.page, query.pageSize),
      user,
      false,
    );
  }

  @Get(':number')
  @ApiOperation({ summary: 'One order, for its owner' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    return stripOrderCost(await this.orders.findByNumber(number, user.id), user, false);
  }

  @Public()
  @Post(':number/track')
  @ApiOperation({
    summary: 'Track a guest order with the phone number it was placed with',
  })
  async track(@Param('number') number: string, @Body() dto: TrackOrderDto) {
    return stripOrderCost(
      await this.orders.findByNumber(number, undefined, dto.phone),
      undefined,
      false,
    );
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
    return stripOrderListCost(
      await this.orders.adminList({
        page: query.page,
        pageSize: query.pageSize,
        skip: query.skip,
        take: query.take,
        q: query.q,
        status: query.status,
      }),
      user,
    );
  }

  @Get(':id')
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return stripOrderCost(await this.orders.adminGet(id), user);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Move the order along; cancelling restores stock' })
  async changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeOrderStatusDto,
  ) {
    return stripOrderCost(await this.orders.changeStatus(user.id, id, dto.status, dto.note), user);
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

  const cookie = readCookie(request.cookies, CART_COOKIE, LEGACY_CART_COOKIE);
  return typeof cookie === 'string' ? cookie : undefined;
}

function toLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
