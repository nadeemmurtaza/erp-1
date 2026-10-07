import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuoteLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nameEn!: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ description: 'Paisa.' })
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;
}

export class CreateQuoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tradingPartnerId!: string;

  @ApiPropertyOptional({ description: 'Defaults to 14 days out when omitted.' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];
}
