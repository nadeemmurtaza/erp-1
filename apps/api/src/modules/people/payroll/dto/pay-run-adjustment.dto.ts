import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

const ADJUSTMENT_REASONS = ['OVERPAYMENT', 'UNDERPAYMENT', 'CORRECTION'] as const;

export class PostPayRunAdjustmentDto {
  @ApiPropertyOptional()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ enum: ADJUSTMENT_REASONS })
  @IsIn(ADJUSTMENT_REASONS)
  reason!: (typeof ADJUSTMENT_REASONS)[number];

  @ApiPropertyOptional({ description: 'Paisa, always positive.' })
  @IsInt()
  @IsPositive()
  amountMinor!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  note!: string;
}
