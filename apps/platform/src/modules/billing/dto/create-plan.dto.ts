import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { RESOURCE_TIERS } from '../../tenants/resource-tier';

const PRICING_MODELS = ['PER_SEAT', 'FLAT_MONTHLY', 'ONE_TIME_LICENSE', 'USAGE_BASED'] as const;
const LICENSE_DEPLOYMENT_MODES = ['OFFLINE', 'ONLINE'] as const;

/** WO-50.1/50.5 — doc 50 §1's own three shapes, one set of fields each
 *  meaningful only for its own `pricingModel`. Validated here rather than
 *  left to the caller: a `PER_SEAT` plan with no `perSeatPriceMinor` would
 *  otherwise only fail later, inside a billing run, for an unrelated
 *  tenant. */
export class CreatePlanDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  editionCap!: string;

  @IsIn(RESOURCE_TIERS)
  includedResourceTier!: (typeof RESOURCE_TIERS)[number];

  @IsIn(PRICING_MODELS)
  pricingModel!: (typeof PRICING_MODELS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  perSeatPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  oneTimeLicenseMinor?: number;

  @IsOptional()
  @IsIn(LICENSE_DEPLOYMENT_MODES)
  licenseDeploymentMode?: (typeof LICENSE_DEPLOYMENT_MODES)[number];

  /** USAGE_BASED only — doc 153 §1. */
  @IsOptional()
  @IsInt()
  @Min(0)
  transactionFeeBps?: number;

  @IsOptional()
  @IsObject()
  usageRateCardMinor?: Record<string, number>;

  @IsOptional()
  @IsObject()
  includedAllowances?: Record<string, number>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
