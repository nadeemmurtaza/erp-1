import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateFeatureFlagDto {
  @ApiProperty({ description: '"payroll.advance-salary-v2", "pos.kitchen-ticket"' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'Either this or killSwitch, never left both undefined — WO-37.3 flags a row with no removal criteria past 90 days.' })
  @IsOptional()
  @IsString()
  removalCriteria?: string;

  @ApiPropertyOptional({ description: 'True when this flag gates a money- or stock-writing path — flipping it to 100% rollout or clearing killSwitch then needs a second approver.' })
  @IsOptional()
  @IsBoolean()
  moneyOrStockPath?: boolean;
}

/**
 * The routine, non-risky edit surface: description, removal criteria, and
 * setting killSwitch to TRUE (turning a feature off is always the safe
 * direction — no second approval needed to stop an incident). Widening
 * rollout or clearing killSwitch on a money/stock-path flag goes through
 * `ProposeRolloutDto`/`approve-rollout` instead.
 */
export class UpdateFeatureFlagDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  removalCriteria?: string;

  @ApiPropertyOptional({ description: 'Only true is accepted here — turning the kill switch off goes through the approval endpoint on a money/stock-path flag.' })
  @IsOptional()
  @IsBoolean()
  killSwitch?: boolean;

  @ApiPropertyOptional({ description: 'Accepted directly only when it does not raise the flag to 100% on a money/stock-path flag.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  enabledOrgIds?: string[];
}

/** The maker half of the maker-checker pair, only reachable on a moneyOrStockPath flag's risky transition. */
export class ProposeRolloutDto {
  @ApiPropertyOptional({ description: 'Propose raising rolloutPercent to this value (typically 100).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  rolloutPercent?: number;

  @ApiPropertyOptional({ description: 'Propose clearing killSwitch back to false.' })
  @IsOptional()
  @IsBoolean()
  killSwitchOff?: boolean;
}
