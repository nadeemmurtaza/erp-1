import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString } from 'class-validator';

export class AddWishlistItemDto {
  @ApiPropertyOptional()
  @IsString()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  variantId?: string;
}

/** WO-7.6's own migration step: whatever the browser's localStorage held before sign-in. */
export class MigrateWishlistDto {
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  productIds!: string[];
}

export class BackInStockRequestDto {
  @ApiPropertyOptional()
  @IsString()
  variantId!: string;
}
