import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class RecordInstalmentPaymentDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  amountMinor!: number;

  /** A provider key, same as any other Payment — "cash" for a counter collection. */
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  provider!: string;
}
