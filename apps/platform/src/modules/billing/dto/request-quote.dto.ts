import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class RequestQuoteDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;

  @IsString()
  @MinLength(1)
  planId!: string;

  @IsInt()
  @Min(1)
  listPriceMinor!: number;

  @IsInt()
  @Min(0)
  quotedPriceMinor!: number;
}

export class RejectQuoteDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
