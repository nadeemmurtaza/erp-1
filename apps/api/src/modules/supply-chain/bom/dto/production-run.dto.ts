import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

const SCOPE_LEVELS = ['ORG', 'BRAND', 'BRANCH'] as const;

export class CreateProductionRunDto {
  @ApiPropertyOptional({ description: 'Must be an ACTIVE recipe.' })
  @IsString()
  @IsNotEmpty()
  recipeId!: string;

  @ApiPropertyOptional({ default: 1, description: 'How many times to run the recipe.' })
  @IsInt()
  @IsPositive()
  @IsOptional()
  runs?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  /** Where the run actually happened. Omit for the shop's one default Location — a WAREHOUSE/PRODUCTION Location names it explicitly (RETAIL-ERP.md R13). */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationId?: string;

  /** RETAIL-ERP.md R13/ADR-021. Omit for BRAND (the default). */
  @ApiPropertyOptional({ enum: SCOPE_LEVELS })
  @IsIn(SCOPE_LEVELS)
  @IsOptional()
  scopeLevel?: (typeof SCOPE_LEVELS)[number];

  /** 71-recipe-batch-traceability.md §1. Only used when the output variant is lot-tracked; omit for an FEFO-suggested default (the run's own number). */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  outputLotCode?: string;
}

export class ProductionRunQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recipeId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  variantId?: string;
}
