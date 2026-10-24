import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TransferLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class DispatchTransferDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sourceLocationId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  destinationLocationId!: string;

  @ApiProperty({ type: [TransferLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReceiveTransferLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lineId!: string;

  @ApiProperty({ description: 'Omit the whole line to receive exactly what was dispatched.' })
  @IsInt()
  @Min(0)
  quantityReceived!: number;
}

export class ReceiveTransferDto {
  @ApiPropertyOptional({
    type: [ReceiveTransferLineDto],
    description: 'Only lines received short (or over) need an entry — everything else receives in full.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  lines?: ReceiveTransferLineDto[];
}

export class CancelTransferDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export const TRANSFER_STATUSES = ['IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const;

export class TransferQueryDto {
  @ApiPropertyOptional({ enum: TRANSFER_STATUSES })
  @IsOptional()
  @IsIn(TRANSFER_STATUSES)
  status?: (typeof TRANSFER_STATUSES)[number];

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
