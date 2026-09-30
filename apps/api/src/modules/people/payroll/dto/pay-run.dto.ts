import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn } from 'class-validator';

const SCOPE_LEVELS = ['ORG', 'BRAND', 'BRANCH'] as const;

export class BuildPayRunDto {
  @ApiPropertyOptional()
  @IsDateString()
  periodStart!: string;

  @ApiPropertyOptional()
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ enum: SCOPE_LEVELS, default: 'BRAND' })
  @IsIn(SCOPE_LEVELS)
  scopeLevel!: (typeof SCOPE_LEVELS)[number];
}
