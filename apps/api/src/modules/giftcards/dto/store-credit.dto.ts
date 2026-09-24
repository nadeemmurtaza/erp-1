import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const ADJUST_REASONS = ['goodwill', 'adjust'] as const;

export class IssueStoreCreditDto {
  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ enum: ADJUST_REASONS })
  @IsIn(ADJUST_REASONS)
  reason!: (typeof ADJUST_REASONS)[number];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
