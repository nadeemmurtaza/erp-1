import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateSupplierBillDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiPropertyOptional({ description: 'Links the bill to the PO it settles — optional, matching SupplierBill.purchaseOrderId.' })
  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @ApiPropertyOptional({ description: "The supplier's own invoice/reference number." })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ description: "The bill amount, in minor units of `currency` below (the supplier's own invoiced total)." })
  @IsInt()
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: 'ISO 4217. Defaults to the supplier’s own currency, or the base currency if unset.' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'rate * 1_000_000 (R16) — required for a bill not in the base currency; ignored (fixed at 1_000_000) otherwise.' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  fxRateScaled?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordSupplierBillPaymentDto {
  @ApiProperty({ description: "The amount of this payment, in minor units of the bill's own currency — cannot exceed the outstanding balance." })
  @IsInt()
  @IsPositive()
  amountMinor!: number;

  @ApiPropertyOptional({
    description:
      'rate * 1_000_000 (R16) actually used to convert this payment to the base currency — required when the bill is not in the base currency, since it may differ from the rate the bill was booked at (that difference is the realised FX gain/loss). Ignored for a base-currency bill.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  fxRateScaled?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
