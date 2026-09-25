import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser, CustomerScope } from '../../core/auth/decorators';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto, BackInStockRequestDto, MigrateWishlistDto } from './dto/wishlist.dto';

/**
 * WO-7.6 — replaces the browser-only localStorage wishlist.
 *
 * Storefront API keys reach the saved items and stock alerts through the
 * `wishlist:*` scopes; `migrate` has none on purpose — it is the browser's
 * one-time localStorage hand-off, never an integration's job.
 */
@ApiTags('wishlist')
@Controller()
@AuthenticatedOnly()
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get('wishlist')
  @CustomerScope('wishlist:read')
  @ApiOperation({ summary: 'My saved items' })
  async list(@CurrentUser('id') userId: string) {
    return this.wishlist.list(userId);
  }

  @Post('wishlist')
  @CustomerScope('wishlist:write')
  @ApiOperation({ summary: 'Save an item' })
  async add(@CurrentUser('id') userId: string, @Body() dto: AddWishlistItemDto) {
    return this.wishlist.add(userId, dto);
  }

  @Delete('wishlist/:id')
  @CustomerScope('wishlist:write')
  @ApiOperation({ summary: 'Remove a saved item' })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.wishlist.remove(userId, id);
    return { removed: true };
  }

  @Post('wishlist/migrate')
  @ApiOperation({ summary: 'Migrate a localStorage wishlist on first sign-in' })
  async migrate(@CurrentUser('id') userId: string, @Body() dto: MigrateWishlistDto) {
    return this.wishlist.migrate(userId, dto.productIds);
  }

  @Get('back-in-stock')
  @CustomerScope('wishlist:read')
  @ApiOperation({ summary: 'My back-in-stock alerts' })
  async myAlerts(@CurrentUser('id') userId: string) {
    return this.wishlist.myBackInStockRequests(userId);
  }

  @Post('back-in-stock')
  @CustomerScope('wishlist:write')
  @ApiOperation({ summary: 'Ask to be notified when a variant is back in stock' })
  async requestAlert(@CurrentUser('id') userId: string, @Body() dto: BackInStockRequestDto) {
    return this.wishlist.requestBackInStockAlert(userId, dto.variantId);
  }

  @Delete('back-in-stock/:variantId')
  @CustomerScope('wishlist:write')
  @ApiOperation({ summary: 'Cancel a back-in-stock alert' })
  async cancelAlert(@CurrentUser('id') userId: string, @Param('variantId') variantId: string) {
    await this.wishlist.cancelBackInStockAlert(userId, variantId);
    return { cancelled: true };
  }
}
