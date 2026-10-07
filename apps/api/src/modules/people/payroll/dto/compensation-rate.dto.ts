import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

const COMPENSATION_BASES = ['MONTHLY', 'HOURLY', 'COMMISSION'] as const;

export class SetCompensationRateDto {
  @ApiPropertyOptional({ enum: COMPENSATION_BASES })
  @IsIn(COMPENSATION_BASES)
  basis!: (typeof COMPENSATION_BASES)[number];

  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(0)
  amountMinor!: number;

  @ApiPropertyOptional()
  @IsDateString()
  effectiveFrom!: string;
}

export class GrossPreviewQueryDto {
  @ApiPropertyOptional()
  @IsDateString()
  periodStart!: string;

  @ApiPropertyOptional()
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ description: 'HOURLY basis only.' })
  @IsNumber()
  @IsOptional()
  hoursWorked?: number;

  @ApiPropertyOptional({ description: 'COMMISSION basis only, paisa.' })
  @IsInt()
  @IsOptional()
  commissionMinor?: number;
}
