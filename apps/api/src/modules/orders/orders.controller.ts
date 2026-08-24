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
  place(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: PlaceOrderDto,
    @Query('locale') locale?: string,
  ) {
    return this.orders.place(cartToken(request), user?.id, dto, toLocale(locale));
  }

  @Get('mine')
  @ApiOperation({ summary: "The signed-in customer's orders" })
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderHistoryQueryDto) {
    return this.orders.listForUser(user.id, query.page, query.pageSize);
  }

  @Get(':number')
  @ApiOperation({ summary: 'One order, for its owner' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    return this.orders.findByNumber(number, user.id);
  }

  @Public()
  @Post(':number/track')
  @ApiOperation({
    summary: 'Track a guest order with the phone number it was placed with',
  })
  track(@Param('number') number: string, @Body() dto: TrackOrderDto) {
    return this.orders.findByNumber(number, undefined, dto.phone);
  }
}

@ApiTags('admin/orders')
@Controller('admin/orders')
@RequirePermission('orders.manage')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'All orders, filterable by status' })
  list(@Query() query: AdminOrderQueryDto) {
    return this.orders.adminList({
      page: query.page,
      pageSize: query.pageSize,
      skip: query.skip,
      take: query.take,
      q: query.q,
      status: query.status,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.adminGet(id);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Move the order along; cancelling restores stock' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeOrderStatusDto,
  ) {
    return this.orders.changeStatus(user.id, id, dto.status, dto.note);
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
