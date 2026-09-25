import { IsString, IsNotEmpty, IsInt, IsOptional, Min, IsArray, ValidateNested, IsBoolean, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCreditNoteDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class VoidNoteDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ApplyCreditNoteDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}

export class CreateDebitNoteDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsOptional()
  supplierBillId?: string;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class SetCreditTermDto {
  @IsInt()
  @Min(0)
  creditLimitMinor!: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  paymentTermDays?: number;

  @IsBoolean()
  @IsOptional()
  isOnHold?: boolean;
}

export class CheckCreditAvailableDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsInt()
  @Min(0)
  newOrderAmountMinor!: number;
}

export class DunningStepDto {
  @IsInt()
  @Min(1)
  daysOverdue!: number;

  @IsString()
  @IsNotEmpty()
  templateKey!: string;
}

export class SetDunningPolicyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DunningStepDto)
  steps!: DunningStepDto[];
}
