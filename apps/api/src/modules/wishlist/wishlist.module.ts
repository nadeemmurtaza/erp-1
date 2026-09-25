import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistAdminController } from './wishlist-admin.controller';
import { WishlistService } from './wishlist.service';
import { BackInStockListener } from './back-in-stock.listener';

@Module({
  controllers: [WishlistController, WishlistAdminController],
  providers: [WishlistService, BackInStockListener],
  exports: [WishlistService],
})
export class WishlistModule {}
