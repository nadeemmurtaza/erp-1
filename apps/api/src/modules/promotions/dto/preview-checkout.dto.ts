import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class PreviewCartLineDto {
  @ApiPropertyOptional()
  @IsString()
  id!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'Paisa' })
  @IsInt()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  quantity!: number;
}

/**
 * Advisory only — this is what the storefront cart page already knows about
 * its own contents, so a preview needs no server round-trip to re-resolve a
 * cart just to show a live number. The real order is always re-priced from
 * the database in OrdersService.place(); nothing here is trusted at checkout.
 */
export class PreviewCheckoutDto {
  @ApiPropertyOptional({ type: [PreviewCartLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreviewCartLineDto)
  lines!: PreviewCartLineDto[];

  @ApiPropertyOptional({ description: 'Paisa' })
  @IsInt()
  @Min(0)
  @IsOptional()
  shippingFee?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  promoCode?: string;
}
