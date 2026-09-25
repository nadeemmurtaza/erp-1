import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser } from '../../core/auth/decorators';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto, BackInStockRequestDto, MigrateWishlistDto } from './dto/wishlist.dto';

/** WO-7.6 — replaces the browser-only localStorage wishlist. */
@ApiTags('wishlist')
@Controller()
@AuthenticatedOnly()
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get('wishlist')
  @ApiOperation({ summary: 'My saved items' })
  async list(@CurrentUser('id') userId: string) {
    return this.wishlist.list(userId);
  }

  @Post('wishlist')
  @ApiOperation({ summary: 'Save an item' })
  async add(@CurrentUser('id') userId: string, @Body() dto: AddWishlistItemDto) {
    return this.wishlist.add(userId, dto);
  }

  @Delete('wishlist/:id')
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
  @ApiOperation({ summary: 'My back-in-stock alerts' })
  async myAlerts(@CurrentUser('id') userId: string) {
    return this.wishlist.myBackInStockRequests(userId);
  }

  @Post('back-in-stock')
  @ApiOperation({ summary: 'Ask to be notified when a variant is back in stock' })
  async requestAlert(@CurrentUser('id') userId: string, @Body() dto: BackInStockRequestDto) {
    return this.wishlist.requestBackInStockAlert(userId, dto.variantId);
  }

  @Delete('back-in-stock/:variantId')
  @ApiOperation({ summary: 'Cancel a back-in-stock alert' })
  async cancelAlert(@CurrentUser('id') userId: string, @Param('variantId') variantId: string) {
    await this.wishlist.cancelBackInStockAlert(userId, variantId);
    return { cancelled: true };
  }
}
