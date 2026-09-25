import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class PurchaseCreditDto {
  @ApiPropertyOptional({ description: 'The Payment row already settling this purchase.' })
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

export class WalletAdjustmentDto {
  @ApiPropertyOptional({ description: 'Paisa — positive credits the account, negative debits it.' })
  @IsInt()
  amountMinor!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class DecideAdjustmentDto {
  @ApiPropertyOptional({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  comment?: string;
}

export class SetWalletAccountStatusDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'FROZEN', 'CLOSED'] })
  @IsIn(['ACTIVE', 'FROZEN', 'CLOSED'])
  status!: 'ACTIVE' | 'FROZEN' | 'CLOSED';
}

export class RefundPurchaseDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  paymentId!: string;

  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

export class RefundRedeemedOrderDto {
  @ApiPropertyOptional({ description: 'Paisa.' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class DisputeMerchantPayableDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class ResolveMerchantPayableDisputeDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'SCHEDULED'] })
  @IsIn(['OPEN', 'SCHEDULED'])
  resolution!: 'OPEN' | 'SCHEDULED';
}

export class SchedulePayoutRunDto {
  @ApiPropertyOptional({ description: "The merchant's own owning User — see MerchantPayableService.schedulePayoutRun()'s own comment on why this is caller-supplied." })
  @IsString()
  @IsNotEmpty()
  merchantOwnerUserId!: string;
}
