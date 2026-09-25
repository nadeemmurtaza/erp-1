import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

const REASON_CODES = ['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'SIZE_FIT_ISSUE', 'CHANGED_MIND', 'OTHER'] as const;
const STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'] as const;

export class ReturnRequestLineDto {
  @ApiPropertyOptional()
  @IsString()
  orderItemId!: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReturnRequestDto {
  /** The order NUMBER (e.g. YSN-2026-0001), not its internal id — that's all a customer ever sees. */
  @ApiPropertyOptional()
  @IsString()
  orderNumber!: string;

  @ApiPropertyOptional({ type: [ReturnRequestLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReturnRequestLineDto)
  lines!: ReturnRequestLineDto[];

  @ApiPropertyOptional({ enum: REASON_CODES })
  @IsIn(REASON_CODES)
  reasonCode!: (typeof REASON_CODES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUrl({}, { each: true })
  photoUrls?: string[];
}

export class DecideReturnRequestDto {
  @ApiPropertyOptional({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote!: string;
}

export class ReturnRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
