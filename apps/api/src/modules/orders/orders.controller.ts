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
import { AuthenticatedOnly, CurrentUser, CustomerScope, Public, RequirePermission } from '../../core/auth/decorators';
import { IdempotentWrite } from '../../core/idempotency/idempotent-write.decorator';
import { SloRecorderService } from '../../core/slo/slo-recorder.service';
import { SLO_PATHS } from '../../core/slo/slo-paths';
import {
  AdminOrderQueryDto,
  ChangeOrderStatusDto,
  OrderHistoryQueryDto,
  PlaceOrderDto,
  TrackOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';
import { stripCodRiskFields, stripCodRiskFieldsList, stripOrderCost, stripOrderListCost } from '../../core/common/cost-fields';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly slo: SloRecorderService,
  ) {}

  @Public()
  @Post()
  @IdempotentWrite('orders.place')
  @ApiOperation({ summary: 'Place the order in the current cart' })
  async place(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: PlaceOrderDto,
    @Query('locale') locale?: string,
  ) {
    // 38-resilience-engineering.md §3, WO-38.3 — checkout's own SLO path.
    // `time()` never awaits its own recording write, so a slow or failed
    // outcome-log write can never slow or fail a real checkout.
    const order = await this.slo.time(SLO_PATHS.Checkout, () =>
      this.orders.place(cartToken(request), user?.id, dto, toLocale(locale)),
    );

    // Cost is never exposed to customers -- strip unconditionally (requirePermission=false).
    // Same for WO-9.4's COD-risk fields: telling a customer they were
    // flagged, and why, is a staff-only tool, never a checkout response.
    return stripCodRiskFields(
      stripOrderCost(order, user, false),
    );
  }

  @AuthenticatedOnly()
  @CustomerScope('orders:read')
  @Get('mine')
  @ApiOperation({ summary: "The signed-in customer's orders" })
  async mine(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderHistoryQueryDto) {
    return stripCodRiskFieldsList(
      stripOrderListCost(
        await this.orders.listForUser(user.id, query.page, query.pageSize),
        user,
        false,
      ),
    );
  }

  @AuthenticatedOnly()
  @CustomerScope('orders:read')
  @Get(':number')
  @ApiOperation({ summary: 'One order, for its owner' })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('number') number: string) {
    return stripCodRiskFields(stripOrderCost(await this.orders.findByNumber(number, user.id), user, false));
  }

  @Public()
  @Post(':number/track')
  @ApiOperation({
    summary: 'Track a guest order with the phone number it was placed with',
  })
  async track(@Param('number') number: string, @Body() dto: TrackOrderDto) {
    return stripCodRiskFields(
      stripOrderCost(
        await this.orders.findByNumber(number, undefined, dto.phone),
        undefined,
        false,
      ),
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
        codRiskAction: query.codRiskAction,
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
