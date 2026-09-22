import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

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
