import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

const RAW_MATERIAL_UNITS = ['GAZ', 'METRE', 'PIECE', 'SPOOL', 'GRAM', 'MILLILITRE'] as const;
const RAW_MATERIAL_KINDS = ['fabric', 'trim', 'packaging', 'consumable'] as const;
const RAW_MATERIAL_FILTERS = ['active', 'inactive', 'all'] as const;

export class CreateRawMaterialDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: RAW_MATERIAL_KINDS, default: 'fabric' })
  @IsIn(RAW_MATERIAL_KINDS)
  @IsOptional()
  kind?: (typeof RAW_MATERIAL_KINDS)[number];

  @ApiPropertyOptional({ enum: RAW_MATERIAL_UNITS })
  @IsIn(RAW_MATERIAL_UNITS)
  unit!: (typeof RAW_MATERIAL_UNITS)[number];

  @ApiPropertyOptional({
    description: 'Base units per display unit — 1000 for continuous goods (GAZ/METRE/GRAM/MILLILITRE), 1 for countable ones (PIECE/SPOOL).',
    default: 1,
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  unitScale?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateRawMaterialDto extends PartialType(CreateRawMaterialDto) {}

export class RawMaterialQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RAW_MATERIAL_KINDS })
  @IsIn(RAW_MATERIAL_KINDS)
  @IsOptional()
  kind?: (typeof RAW_MATERIAL_KINDS)[number];

  @ApiPropertyOptional({ enum: RAW_MATERIAL_FILTERS, default: 'active' })
  @IsIn(RAW_MATERIAL_FILTERS)
  @IsOptional()
  filter?: (typeof RAW_MATERIAL_FILTERS)[number];
}
