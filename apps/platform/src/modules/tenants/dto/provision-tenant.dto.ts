import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RESOURCE_TIERS } from '../resource-tier';

/**
 * WO-39.2's provisioning request. `slug` is the idempotency key —
 * `ProvisioningService.provisionTenant()` treats a retried call with the
 * same slug as "already in progress/done", never a second tenant.
 */
export class ProvisionTenantDto {
  @IsString()
  @MinLength(3)
  @MaxLength(63)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'slug must be lowercase alphanumeric with hyphens, matching a valid subdomain label',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  legalName!: string;

  @IsString()
  planKey!: string;

  @IsOptional()
  @IsIn(RESOURCE_TIERS)
  resourceTier?: (typeof RESOURCE_TIERS)[number];

  @IsOptional()
  @IsString()
  customDomain?: string;

  @IsOptional()
  @IsEmail()
  billingContactEmail?: string;

  /** WO-51.1 — present only for a trial: the tenant provisions exactly as
   *  any other (doc 51 §1's own "not a different kind of tenant"), lands
   *  at TRIAL instead of ACTIVE, with `trialExpiresAt` set this many days
   *  out, and is never billed until it converts. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  trialDays?: number;
}
