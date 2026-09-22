import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

const RAW_USAGE_BUCKETS = ['day', 'month'] as const;

export class RawUsageQueryDto {
  @ApiPropertyOptional({ default: 30, description: 'Window size, in days, ending now.' })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  days?: number;

  @ApiPropertyOptional({ enum: RAW_USAGE_BUCKETS, description: 'Defaults to day for a window of 62 days or less, month otherwise.' })
  @IsIn(RAW_USAGE_BUCKETS)
  @IsOptional()
  bucket?: (typeof RAW_USAGE_BUCKETS)[number];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  rawMaterialId?: string;

  @ApiPropertyOptional({ description: '"fabric" | "trim" | "packaging" | "consumable"' })
  @IsString()
  @IsOptional()
  kind?: string;
}
