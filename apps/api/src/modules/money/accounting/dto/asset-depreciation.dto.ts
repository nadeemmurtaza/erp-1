import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, Min } from 'class-validator';

const METHODS = ['STRAIGHT_LINE', 'DECLINING_BALANCE'] as const;

export class CreateDepreciationScheduleDto {
  @ApiProperty({ enum: METHODS })
  @IsIn(METHODS)
  method!: (typeof METHODS)[number];

  /** Defaults to the asset's own purchaseCostMinor when omitted. */
  @ApiPropertyOptional()
  @IsInt()
  @IsPositive()
  @IsOptional()
  acquisitionCostMinor?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  salvageValueMinor?: number;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  usefulLifeMonths!: number;

  /** DECLINING_BALANCE only. */
  @ApiPropertyOptional()
  @IsInt()
  @IsPositive()
  @IsOptional()
  decliningRateBps?: number;

  @ApiProperty()
  @IsDateString()
  startDate!: string;
}

export class DisposeAssetDto {
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  disposalDate?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  saleProceedsMinor?: number;
}
