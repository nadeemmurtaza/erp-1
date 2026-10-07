import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

const WRITE_OFF_STATUSES = ['RETIRED', 'LOST'] as const;

export class CreateAssetDto {
  @ApiPropertyOptional()
  @IsString()
  assetTag!: string;

  @ApiPropertyOptional()
  @IsString()
  category!: string;

  @ApiPropertyOptional()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsPositive()
  @IsOptional()
  purchaseCostMinor?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  purchasedOn?: string;
}

export class IssueAssetDto {
  @ApiPropertyOptional()
  @IsString()
  userId!: string;
}

export class ReturnAssetDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  condition?: string;
}

export class WriteOffAssetDto {
  @ApiPropertyOptional({ enum: WRITE_OFF_STATUSES })
  @IsIn(WRITE_OFF_STATUSES)
  status!: (typeof WRITE_OFF_STATUSES)[number];
}
