import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { RESOURCE_TIERS } from '../../tenants/resource-tier';

export class UpsertQuotaDto {
  @IsIn(RESOURCE_TIERS)
  resourceTier!: (typeof RESOURCE_TIERS)[number];

  @IsString()
  @MinLength(1)
  metric!: string;

  @IsNumber()
  @Min(0)
  limitValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  warnThresholdPct?: number;
}
