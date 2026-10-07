import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class InvoiceLineDto {
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

export class CreateInvoiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  tradingPartnerId!: string;

  @ApiPropertyOptional({ description: 'Trace-back only — see invoicing.prisma header.' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Paisa. Defaults to 0.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}

export class InvoiceQueryDto {
  /** 56-overdue-invoices-counter.md — the same `ISSUED` + past-`dueDate` filter `overdueInvoicesSummary()` computes, so the tile's own link lands on this exact filtered set. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  overdue?: boolean;
}
