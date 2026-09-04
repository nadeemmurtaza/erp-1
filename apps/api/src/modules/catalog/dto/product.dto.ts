import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES, PRODUCT_KINDS, PRODUCT_STATUSES, type ProductKind } from '@yaseen/shared';

export class ProductTranslationDto {
  @ApiProperty({ enum: LOCALES, example: 'en' })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty({ example: '3-Piece Embroidered Lawn Suit' })
  @IsString()
  @IsNotEmpty({ message: 'Product name is required.' })
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  careInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(70)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  metaDescription?: string;
}

export class ProductVariantDto {
  @ApiPropertyOptional({ description: 'Omit to create; supply to update' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'LWN-3PC-BLU-M' })
  @IsString()
  @IsNotEmpty({ message: 'Every variant needs a SKU.' })
  @MaxLength(60)
  sku!: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  size?: string;

  @ApiPropertyOptional({ example: 'Ferozi' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;

  @ApiPropertyOptional({ example: '#2e8b9a' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  colorHex?: string;

  @ApiPropertyOptional({ description: 'Overrides the product price, in paisa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceOverride?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  order?: number;
}

export class CreateProductDto {
  @ApiPropertyOptional({ description: 'Derived from the English name when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(90)
  slug?: string;

  @ApiProperty({ enum: PRODUCT_KINDS })
  @IsIn([...PRODUCT_KINDS])
  kind!: ProductKind;

  @ApiPropertyOptional({ enum: PRODUCT_STATUSES, default: 'DRAFT' })
  @IsOptional()
  @IsIn([...PRODUCT_STATUSES])
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    description: 'Price in paisa (Rs 4,500 -> 450000). For a service, the base fee.',
    example: 450000,
  })
  @IsInt({ message: 'Price must be a whole number of paisa.' })
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({ description: '"Was" price in paisa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional({ example: 'lawn' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  fabric?: string;

  @ApiPropertyOptional({ example: 'summer' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  season?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @ApiPropertyOptional({ description: 'UNSTITCHED only: 1, 2 or 3-piece', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  pieceCount?: number;

  @ApiPropertyOptional({ description: 'UNSTITCHED only: metres of fabric' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fabricMeters?: number;

  @ApiPropertyOptional({ description: 'UNSTITCHED only: offer "get it stitched"' })
  @IsOptional()
  @IsBoolean()
  stitchingAvailable?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'UNSTITCHED: garment type ids this fabric can be made into. STITCHED: garment type ids that drive this ready-to-wear product\'s size chart.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  garmentTypeIds?: string[];

  @ApiPropertyOptional({ description: 'STITCHING_SERVICE only: the garment stitched' })
  @IsOptional()
  @IsString()
  garmentTypeId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  featuredRank?: number;

  @ApiProperty({ type: [ProductTranslationDto], description: 'At least the English row' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  translations!: ProductTranslationDto[];

  @ApiPropertyOptional({ type: [ProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];
}

export class UpdateProductDto extends CreateProductDto {
  @ApiPropertyOptional({ enum: PRODUCT_KINDS })
  @IsOptional()
  @IsIn([...PRODUCT_KINDS])
  declare kind: ProductKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  declare basePrice: number;

  @ApiPropertyOptional({ type: [ProductTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  declare translations: ProductTranslationDto[];
}
