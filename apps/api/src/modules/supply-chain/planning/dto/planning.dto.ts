import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, Min } from 'class-validator';

const SHOCK_KINDS = ['SupplierDown', 'LeadTimeShift', 'LocationDown', 'DemandShock', 'CashShock', 'SkuRecall'] as const;

export class RunPropagationDto {
  @ApiProperty({ enum: SHOCK_KINDS })
  @IsIn(SHOCK_KINDS)
  kind!: (typeof SHOCK_KINDS)[number];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  locationId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  variantId?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsPositive()
  @IsOptional()
  days?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  deltaDays?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  pctChange?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  amountMinor?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  includeNarration?: boolean;
}

export class AssignFulfillingBranchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  locationId!: string;
}

export class LiquidityForecastQueryDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  horizonDays?: number;
}
