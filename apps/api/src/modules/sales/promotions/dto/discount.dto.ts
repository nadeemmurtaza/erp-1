import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING', 'BUY_X_GET_Y', 'TIERED'] as const;
const DISCOUNT_SCOPES = ['ORDER', 'PRODUCT', 'CATEGORY', 'COLLECTION', 'SHIPPING'] as const;

export class CreateDiscountDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: DISCOUNT_TYPES })
  @IsIn(DISCOUNT_TYPES)
  type!: (typeof DISCOUNT_TYPES)[number];

  @ApiPropertyOptional({ enum: DISCOUNT_SCOPES, default: 'ORDER' })
  @IsIn(DISCOUNT_SCOPES)
  @IsOptional()
  scope?: (typeof DISCOUNT_SCOPES)[number];

  @ApiPropertyOptional({ description: 'PERCENTAGE/TIERED: basis points. FIXED_AMOUNT: paisa. Ignored by FREE_SHIPPING/BUY_X_GET_Y.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ description: 'Paisa cap on a PERCENTAGE/TIERED discount.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxDiscount?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  minSubtotal?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  minQuantity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerSegmentId?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  firstOrderOnly?: boolean;

  @ApiPropertyOptional({ description: 'BUY_X_GET_Y only.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  buyQuantity?: number;

  @ApiPropertyOptional({ description: 'BUY_X_GET_Y only.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  getQuantity?: number;

  @ApiPropertyOptional({ description: 'BUY_X_GET_Y only. 10000 = free.' })
  @IsInt()
  @Min(1)
  @IsOptional()
  getDiscountBps?: number;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  endsAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isStackable?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  usageLimitPerUser?: number;
}

export class UpdateDiscountDto extends PartialType(CreateDiscountDto) {}

export class DiscountQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/** WO-5.6's "what would this do to the last 30 days of orders" builder preview. */
export class PreviewDiscountDto extends CreateDiscountDto {}
