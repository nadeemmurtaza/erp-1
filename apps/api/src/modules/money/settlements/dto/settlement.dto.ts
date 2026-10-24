import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExpectedBatchDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  settlementProviderId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  externalBatchRef!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  paymentIds!: string[];
}

export class RequestWriteoffDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
