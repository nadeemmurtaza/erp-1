import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';
import { MAX_PRICE_MINOR } from '../bidding';
import { BIDDER_DECISIONS, REGISTRATION_MODES, type BidderDecision, type BidderStatus, type RegistrationMode } from '../bidder-trust';

/**
 * The largest price or bid, in minor units (doc 234 §12). The columns are
 * BIGINT since WO-234.2; the ceiling is `MAX_PRICE_MINOR`, the largest round
 * number whose arithmetic stays exact in a JavaScript number. Enforced here so
 * an over-large price is a 400 with a reason, never a rounding error later.
 */
export const MAX_MINOR = MAX_PRICE_MINOR;

/** The only type that can be created until sealed-bid (WO-234.7) and reverse (WO-234.8) exist. */
export const CREATABLE_AUCTION_TYPES = ['ENGLISH'] as const;

export const AUCTION_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSING', 'CLOSED', 'SETTLED', 'CANCELLED'] as const;

/** Longest reason a staff member writes for a decision or a strike, and the bidder reads (doc 234 §12). */
export const MAX_REASON_LENGTH = 500;
/** Longest appeal a bidder writes. */
export const MAX_APPEAL_LENGTH = 1_000;

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

  @ApiPropertyOptional({
    enum: REGISTRATION_MODES,
    description:
      'Who may bid. OPEN: any signed-in customer. VERIFIED: customers with a verified identity bid at once, everyone else waits for approval. ' +
      'APPROVAL: everyone waits for approval. Left out, the Setting `auction.registration_default` applies.',
  })
  @IsOptional()
  @IsIn(REGISTRATION_MODES)
  registration?: RegistrationMode;
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

  @ApiPropertyOptional({
    enum: REGISTRATION_MODES,
    description: 'Who may bid, changed while the auction is a draft.',
  })
  @IsOptional()
  @IsIn(REGISTRATION_MODES)
  registration?: RegistrationMode;
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

export class PlaceBidDto {
  @ApiProperty({ description: 'What the bidder offers, in minor units. Must reach the lot’s minimum next bid.' })
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  amountMinor!: number;

  @ApiProperty({
    description:
      'One per intended bid, chosen by the client (a UUID is right) and sent unchanged on every retry of that bid. ' +
      'A retry with the same key returns the bid already accepted instead of placing a second one.',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @Length(8, 64)
  @Matches(/^[A-Za-z0-9._:-]+$/, { message: 'idempotencyKey may contain letters, digits and . _ : - only.' })
  idempotencyKey!: string;
}

/** Newest bid first; page, page size and `order` come from the shared list query. */
export class BidListQueryDto extends PaginationQueryDto {}

export class SetProxyBidDto {
  @ApiProperty({
    description:
      'The most you will pay, in minor units. The system bids the least that keeps you ahead, up to this. ' +
      'It can be raised later but never lowered, and only you can read it.',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR)
  maxMinor!: number;
}

export const PUBLIC_LOT_STATES = ['live', 'upcoming', 'ended'] as const;
export type PublicLotState = (typeof PUBLIC_LOT_STATES)[number];

export class PublicLotListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PUBLIC_LOT_STATES,
    default: 'live',
    description: 'live: open now, ending soonest first. upcoming: in a scheduled auction, starting soonest first. ended: closed, most recently first.',
  })
  @IsOptional()
  @IsIn(PUBLIC_LOT_STATES)
  state: PublicLotState = 'live';

  @ApiPropertyOptional({ description: 'Part of a lot title' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  override q?: string;
}

export const BIDDER_FILTERS = ['waiting', 'approved', 'stopped', 'appeals'] as const;
export type BidderFilter = (typeof BIDDER_FILTERS)[number];

/** Oldest first by default: a queue is worked from the top. Page, page size and `order` come from the shared list query. */
export class BidderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: BIDDER_FILTERS,
    description: 'waiting: registrations to decide. approved. stopped: suspended or declined. appeals: a suspended or declined bidder who is waiting for an answer. Left out: everyone.',
  })
  @IsOptional()
  @IsIn(BIDDER_FILTERS)
  filter?: BidderFilter;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override order: 'asc' | 'desc' = 'asc';
}

const BIDDER_STATUSES = ['PENDING', 'APPROVED', 'SUSPENDED', 'DECLINED'] as const;

export class BidderDecisionDto {
  @ApiProperty({ enum: BIDDER_DECISIONS })
  @IsIn(BIDDER_DECISIONS)
  decision!: BidderDecision;

  @ApiProperty({
    enum: BIDDER_STATUSES,
    description:
      'The status the staff member was looking at. If the bidder has moved on since, the decision is refused (409) instead of ' +
      'landing on a state nobody chose it for.',
  })
  @IsIn(BIDDER_STATUSES)
  expectedStatus!: BidderStatus;

  @ApiPropertyOptional({
    maxLength: MAX_REASON_LENGTH,
    description: 'Required for a decline, a suspension and keeping a decision. The bidder reads it, so it is written for them.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_REASON_LENGTH)
  reason?: string;
}

export class RecordStrikeDto {
  @ApiProperty({ maxLength: MAX_REASON_LENGTH, description: 'What happened. Kept on record and in the audit trail.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;

  @ApiPropertyOptional({ description: 'The lot it concerns, when there is one. Must belong to this auction.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lotId?: string;
}

export class VoidStrikeDto {
  @ApiProperty({ maxLength: MAX_REASON_LENGTH, description: 'Why the strike was a mistake. The strike stays on record, marked void.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_REASON_LENGTH)
  reason!: string;
}

export class AppealDto {
  @ApiProperty({ maxLength: MAX_APPEAL_LENGTH, description: 'Why the decision should be looked at again.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_APPEAL_LENGTH)
  message!: string;
}
