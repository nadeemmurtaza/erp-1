import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

/**
 * The largest amount a minor-unit column holds. Every money column in this
 * codebase is a 32-bit INTEGER, so a lot price tops out at 21,474,836.47 in a
 * two-decimal currency. Enforced here so an over-large price is a 400 with a
 * reason, never a database overflow (doc 234 §12 records the open decision on
 * widening it before real-estate or vehicle lots).
 */
export const MAX_MINOR = 2_147_483_647;

/** The only type that can be created until sealed-bid (WO-234.7) and reverse (WO-234.8) exist. */
export const CREATABLE_AUCTION_TYPES = ['ENGLISH'] as const;

export const AUCTION_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSING', 'CLOSED', 'SETTLED', 'CANCELLED'] as const;

export class CreateAuctionDto {
  @ApiPropertyOptional({ enum: CREATABLE_AUCTION_TYPES, default: 'ENGLISH' })
  @IsOptional()
  @IsIn(CREATABLE_AUCTION_TYPES)
  type?: (typeof CREATABLE_AUCTION_TYPES)[number];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @ApiProperty({ description: 'When bidding opens (ISO 8601). Must be in the future before the auction can be scheduled.' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ description: 'When bidding closes (ISO 8601), after startsAt.' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional({ description: 'The selling location, when the auction is run from one branch.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outletLocationId?: string;

  @ApiPropertyOptional({ description: 'Terms bidders accept, shown on every lot page.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  terms?: string;
}

export class UpdateAuctionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  outletLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  terms?: string;
}

export class CancelAuctionDto {
  @ApiProperty({ description: 'Why the auction is being cancelled — written to the audit trail.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

export class CreateAuctionLotDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @ApiProperty({ description: 'Opening price in minor units.' })
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  startPriceMinor!: number;

  @ApiPropertyOptional({ description: 'Hidden reserve in minor units — never shown to bidders. At or above the opening price.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  reservePriceMinor?: number;
}

export class UpdateAuctionLotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  startPriceMinor?: number;

  @ApiPropertyOptional({ description: 'Send null to remove the reserve.', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  reservePriceMinor?: number | null;
}

/** Page, page size, free-text search (`q`: title or number) and `order` (by start time) come from the shared list query. */
export class AuctionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AUCTION_STATUSES })
  @IsOptional()
  @IsIn(AUCTION_STATUSES)
  status?: (typeof AUCTION_STATUSES)[number];
}
