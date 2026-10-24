import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

const RECIPE_FILTERS = ['all', 'active', 'missing', 'incomplete-cost'] as const;

export class BomComponentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  rawMaterialId!: string;

  @ApiPropertyOptional({ description: 'Base units of the raw material consumed per outputQuantity finished units.' })
  @IsInt()
  @IsPositive()
  quantityBase!: number;

  @ApiPropertyOptional({ description: 'Overrides the recipe wastageBps for this line. Omit to inherit.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  wastageBps?: number;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isOptional?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}

export class CreateRecipeDto {
  @ApiPropertyOptional({ description: 'The finished ProductVariant this recipe produces.' })
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @IsPositive()
  @IsOptional()
  outputQuantity?: number;

  @ApiPropertyOptional({ default: 0, description: 'Basis points. 500 = 5%.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  wastageBps?: number;

  @ApiPropertyOptional({ default: 0, description: 'Paisa per finished unit.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  labourCost?: number;

  @ApiPropertyOptional({ default: 0, description: 'Paisa per finished unit.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  overheadCost?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [BomComponentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomComponentDto)
  @IsOptional()
  components?: BomComponentDto[];
}

export class UpdateRecipeDto extends PartialType(OmitType(CreateRecipeDto, ['variantId'] as const)) {}

export class RecipeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RECIPE_FILTERS, default: 'all' })
  @IsIn(RECIPE_FILTERS)
  @IsOptional()
  filter?: (typeof RECIPE_FILTERS)[number];
}

export class RecipeAvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'Finished units to check availability for. Defaults to the recipe outputQuantity.' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  quantity?: number;
}
