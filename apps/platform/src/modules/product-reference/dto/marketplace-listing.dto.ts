import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const LISTING_KINDS = ['PRODUCT', 'SERVICE'] as const;
const AUDIENCES = ['RETAILER', 'DISTRIBUTOR', 'SUPPLIER', 'DIRECT_CUSTOMER'] as const;
const ENGAGEMENT_MODES = ['DISCOVERY_ONLY', 'DISCOVERY_AND_TRANSACT'] as const;

/**
 * `POST /marketplace/v1/listings` — doc 165 §2's "Publish to marketplace"
 * screen. `visibleTo`/`engagementMode` are the actual controls the owner
 * asked for ("he can control who can see his product/services... let the
 * client choose") — never a backend-only flag nobody can reach.
 */
export class CreateMarketplaceListingDto {
  @IsIn(LISTING_KINDS)
  kind!: (typeof LISTING_KINDS)[number];

  /** The tenant's own ProductVariant/Service id — opaque to the directory. */
  @IsString()
  @IsNotEmpty()
  externalRef!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinorUnits?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(AUDIENCES, { each: true })
  visibleTo!: (typeof AUDIENCES)[number][];

  @IsOptional()
  @IsIn(ENGAGEMENT_MODES)
  engagementMode?: (typeof ENGAGEMENT_MODES)[number];
}

/**
 * `PATCH /marketplace/v1/listings/:id` — the publishing tenant only. A
 * re-published listing (same `externalRef`) is an update, never a
 * duplicate — `MarketplaceListing.@@unique([tenantId, externalRef])` is
 * what makes that true; `MarketplaceListingsService.publish()` upserts on
 * it rather than this endpoint being the only way to change a listing.
 */
export class UpdateMarketplaceListingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinorUnits?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(AUDIENCES, { each: true })
  visibleTo?: (typeof AUDIENCES)[number][];

  @IsOptional()
  @IsIn(ENGAGEMENT_MODES)
  engagementMode?: (typeof ENGAGEMENT_MODES)[number];
}
