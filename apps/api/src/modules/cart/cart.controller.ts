import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@yaseen/shared';
import { CART_COOKIE, type AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Public } from '../../core/auth/decorators';
import { CartService, type CartView } from './cart.service';
import { AddCartItemDto, MergeCartDto, UpdateCartItemDto } from './dto/cart.dto';

const CART_COOKIE_MAX_AGE_MS = 30 * 86_400_000;

/**
 * Cart endpoints.
 *
 * All are @Public so a guest can shop without an account — a COD store that
 * forces sign-up before the basket loses most of its customers. When a token
 * IS present the signed-in user is still read, so a customer's saved
 * measurement profiles work on the same endpoints.
 */
@ApiTags('cart')
@Controller('cart')
@Public()
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'The current cart, priced fresh from the database' })
  async get(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('locale') locale?: string,
  ): Promise<CartView> {
    const cart = await this.cart.getOrCreate(
      tokenFrom(request),
      user?.id,
      toLocale(locale),
    );
    this.setCookie(response, cart.token);
    return cart;
  }

  @Post('items')
  @ApiOperation({ summary: 'Add an item, optionally with stitching' })
  async addItem(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: AddCartItemDto,
    @Query('locale') locale?: string,
  ): Promise<CartView> {
    const cart = await this.cart.addItem(
      tokenFrom(request),
      user?.id,
      dto,
      toLocale(locale),
    );
    this.setCookie(response, cart.token);
    return cart;
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Change quantity, or attach measurements' })
  async updateItem(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @Query('locale') locale?: string,
  ): Promise<CartView> {
    const cart = await this.cart.updateItem(
      tokenFrom(request),
      user?.id,
      itemId,
      dto,
      toLocale(locale),
    );
    this.setCookie(response, cart.token);
    return cart;
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a line' })
  async removeItem(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('itemId') itemId: string,
    @Query('locale') locale?: string,
  ): Promise<CartView> {
    const cart = await this.cart.removeItem(
      tokenFrom(request),
      user?.id,
      itemId,
      toLocale(locale),
    );
    this.setCookie(response, cart.token);
    return cart;
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Empty the cart' })
  async clear(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('locale') locale?: string,
  ): Promise<CartView> {
    const cart = await this.cart.clear(tokenFrom(request), user?.id, toLocale(locale));
    this.setCookie(response, cart.token);
    return cart;
  }

  @Post('merge')
  @ApiOperation({ summary: 'Fold a guest cart into the signed-in account' })
  async merge(
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: MergeCartDto,
  ): Promise<CartView> {
    if (!user) {
      // Nothing to merge into; the guest cart is already the current one.
      return this.cart.getOrCreate(dto.token, undefined);
    }

    const cart = await this.cart.mergeGuestCart(dto.token, user.id);
    this.setCookie(response, cart.token);
    return cart;
  }

  private setCookie(response: Response, token: string): void {
    response.cookie(CART_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: CART_COOKIE_MAX_AGE_MS,
    });
  }
}

/**
 * The cart token, from the cookie or an explicit header.
 *
 * The header exists for the mobile app, which has no cookie jar shared with
 * the browser.
 */
function tokenFrom(request: Request): string | undefined {
  const header = request.header('x-cart-token');
  if (header) return header;

  const cookie = request.cookies?.[CART_COOKIE];
  return typeof cookie === 'string' ? cookie : undefined;
}

function toLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}
