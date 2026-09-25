import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class IssueCreditNoteDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}

export class PreviewInvoiceDto {
  @IsString()
  periodStart!: string;

  @IsString()
  periodEnd!: string;
}
