import { IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

/** doc 153 WO-153.4 — a proposed change to a USAGE_BASED plan's own rate
 *  card. At least one of the three proposed fields should be set; left-out
 *  fields mean "leave this part of the rate card unchanged" (RateCardService
 *  resolves each against the plan's current value, never a silent zero). */
export class ProposeRateCardChangeDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  transactionFeeBps?: number;

  @IsOptional()
  @IsObject()
  usageRateCardMinor?: Record<string, number>;

  @IsOptional()
  @IsObject()
  includedAllowances?: Record<string, number>;
}

export class RejectRateCardChangeDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
