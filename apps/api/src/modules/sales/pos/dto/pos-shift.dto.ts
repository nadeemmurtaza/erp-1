import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

const CASH_MOVEMENT_TYPES = ['CASH_IN', 'CASH_OUT', 'DROP', 'PAID_OUT'] as const;
export type CashMovementTypeDto = (typeof CASH_MOVEMENT_TYPES)[number];

export class OpenShiftDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  terminalId!: string;

  @ApiProperty({ description: 'Paisa — the cash float the drawer opens with.' })
  @IsInt()
  @Min(0)
  openingCashMinor!: number;
}

export class CloseShiftDto {
  @ApiProperty({ description: "Paisa — the cashier's own physical count of the drawer." })
  @IsInt()
  @Min(0)
  closingCashMinor!: number;
}

export class RecordCashMovementDto {
  @ApiProperty({
    enum: CASH_MOVEMENT_TYPES,
    description: 'Never OPENING_FLOAT — that is recorded once, by opening the shift, not through this endpoint.',
  })
  @IsIn(CASH_MOVEMENT_TYPES)
  type!: CashMovementTypeDto;

  @ApiProperty({ description: 'Paisa — always positive; type says which direction.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
