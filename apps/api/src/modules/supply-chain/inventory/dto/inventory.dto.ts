import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, NotEquals } from 'class-validator';

/** Mirrors StockAdjustment.reason — kept as a union so the admin form has a fixed list. */
export const STOCK_ADJUSTMENT_REASONS = [
  'restock',
  'correction',
  'damaged',
  'sold_offline',
  'other',
] as const;

export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export class AdjustStockDto {
  @ApiProperty({ description: 'Positive adds stock, negative removes it. Never zero.' })
  @IsInt()
  @NotEquals(0)
  delta!: number;

  @ApiProperty({ enum: STOCK_ADJUSTMENT_REASONS })
  @IsIn([...STOCK_ADJUSTMENT_REASONS])
  reason!: StockAdjustmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
