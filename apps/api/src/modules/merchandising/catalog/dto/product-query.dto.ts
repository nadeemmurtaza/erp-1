import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { LOCALES, PRODUCT_KINDS, PRODUCT_STATUSES, type ProductKind } from '@newax/shared';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

const csvToArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (typeof value !== 'string') return value as string[] | undefined;
  const parts = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
};

export const PRODUCT_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'featured',
  'name',
] as const;

/** Storefront listing filters. */
export class ProductQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LOCALES, default: 'en' })
  @IsOptional()
  @IsIn([...LOCALES])
  locale: 'en' | 'ur' = 'en';

  @ApiPropertyOptional({ description: 'Category slug or id' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: PRODUCT_KINDS })
  @IsOptional()
  @IsIn([...PRODUCT_KINDS])
  kind?: ProductKind;

  @ApiPropertyOptional({ description: 'Comma-separated, e.g. lawn,chiffon' })
  @IsOptional()
  @Transform(csvToArray)
  fabric?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated' })
  @IsOptional()
  @Transform(csvToArray)
  season?: string[];

  @ApiPropertyOptional({ description: 'Comma-separated, e.g. 2,3' })
  @IsOptional()
  @Transform(csvToArray)
  pieceCount?: string[];

  @ApiPropertyOptional({ description: 'Minimum price in paisa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price in paisa' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'featured' })
  @IsOptional()
  @IsIn([...PRODUCT_SORTS])
  sort: (typeof PRODUCT_SORTS)[number] = 'featured';
}

/** Admin listing filters — adds status, which the storefront never sees. */
export class AdminProductQueryDto extends ProductQueryDto {
  @ApiPropertyOptional({ enum: PRODUCT_STATUSES })
  @IsOptional()
  @IsIn([...PRODUCT_STATUSES])
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

  @ApiPropertyOptional({ description: 'Only variants at or below their threshold' })
  @IsOptional()
  @IsString()
  lowStock?: string;
}
