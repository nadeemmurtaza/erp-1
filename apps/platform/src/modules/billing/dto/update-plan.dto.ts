import { IsBoolean, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

/**
 * WO-154.1/154.3 — the entire admin-facing surface doc 154 adds on top of
 * doc 50/153's own `PlatformPlan` fields: flip `isHeadline`/set its
 * `headlineOrder` for the public pricing-comparison page, and set the
 * public copy `getPlanComparison()` reads (`displayName`/`priceDescription`/
 * `bestFor`/`ctaLabel` — ADR-040). Every field optional so this same
 * endpoint can flip only the headline flag, only the copy, or both in one
 * call — `PlansService.update()` fills in what a partial call omits.
 */
export class UpdatePlanDto {
  @IsOptional()
  @IsBoolean()
  isHeadline?: boolean;

  /** Required by `PlansService.update()` when the resulting `isHeadline`
   *  is true and the plan carries no `headlineOrder` already — never
   *  enforced here, since "required" depends on the plan's own current
   *  row, not on this DTO alone. */
  @IsOptional()
  @IsInt()
  @Min(0)
  headlineOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  priceDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bestFor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;
}
