import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateReturnReasonDto {
  @ApiProperty({ example: 'too_small' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiProperty({ example: [{ locale: 'en', label: 'Too small' }] })
  @IsArray()
  translations!: Array<{ locale: string; label: string }>;
}

class ReturnRequestLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderItemId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reasonId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReturnRequestDto {
  @ApiProperty({ description: 'The order NUMBER the customer sees on their receipt, not the internal id' })
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;

  @ApiProperty({ type: [ReturnRequestLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnRequestLineDto)
  items!: ReturnRequestLineDto[];
}

export class DecideReturnRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

class InspectionLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ description: 'True: back on the shelf (RETURN). False: written off (WRITE_OFF).' })
  @IsBoolean()
  restockable!: boolean;
}

export class InspectReturnRequestDto {
  @ApiProperty({ type: [InspectionLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectionLineDto)
  items!: InspectionLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  staffNote?: string;
}

const RESOLUTIONS = ['REFUND', 'EXCHANGE', 'STORE_CREDIT', 'REPAIR', 'REJECTED'] as const;

export class ResolveReturnRequestDto {
  @ApiProperty({ enum: RESOLUTIONS })
  @IsIn(RESOLUTIONS)
  resolution!: (typeof RESOLUTIONS)[number];

  @ApiPropertyOptional({ description: 'Paisa — informational only when resolution is not REFUND' })
  @IsOptional()
  @IsInt()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  staffNote?: string;
}
