import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES } from '@newax/shared';

const SORT_STRATEGIES = ['MANUAL', 'BEST_SELLING', 'NEWEST', 'PRICE_ASC', 'PRICE_DESC', 'MARGIN'] as const;

export class CollectionTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaDescription?: string;
}

export class CreateCollectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  slug!: string;

  @ApiPropertyOptional({ description: 'CollectionRule — see @newax/shared/collection-rules. Omit for a manually curated collection.' })
  @IsOptional()
  @IsObject()
  rule?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: SORT_STRATEGIES, default: 'MANUAL' })
  @IsOptional()
  @IsIn(SORT_STRATEGIES)
  sortStrategy?: (typeof SORT_STRATEGIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [CollectionTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CollectionTranslationDto)
  translations!: CollectionTranslationDto[];
}

export class UpdateCollectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  rule?: Record<string, unknown> | null;

  @ApiPropertyOptional({ enum: SORT_STRATEGIES })
  @IsOptional()
  @IsIn(SORT_STRATEGIES)
  sortStrategy?: (typeof SORT_STRATEGIES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [CollectionTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CollectionTranslationDto)
  translations?: CollectionTranslationDto[];
}

export class AddCollectionProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class ReorderCollectionProductsDto {
  @ApiProperty({ type: [String], description: 'Product ids, in the new display order' })
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}
