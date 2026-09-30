import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

const LISTING_KINDS = ['PRODUCT', 'SERVICE'] as const;
const AUDIENCES = ['RETAILER', 'DISTRIBUTOR', 'SUPPLIER', 'DIRECT_CUSTOMER'] as const;
const ENGAGEMENT_MODES = ['DISCOVERY_ONLY', 'DISCOVERY_AND_TRANSACT'] as const;

/**
 * `POST /admin/marketplace/listings` — the "Publish to marketplace" screen
 * (165-cross-tenant-marketplace-directory.md §2, WO-165.2). Mirrors the
 * platform's own `CreateMarketplaceListingDto` field-for-field: two
 * separate Nest apps with no shared code path for a request DTO
 * (`@newax/shared` is for cross-app CONSTANTS, not per-app validation
 * classes — `ManagedServicesController`'s own GET-only surface never faced
 * this question, so there is no existing precedent to reuse instead of
 * this small, deliberate duplication).
 */
export class PublishMarketplaceListingDto {
  @IsIn(LISTING_KINDS)
  kind!: (typeof LISTING_KINDS)[number];

  /** This deployment's own Product.id — opaque to the directory, echoed
   *  back unchanged on any future engagement. */
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

  /** "He can control who can see his product/services" — the actual
   *  control, not a backend-only flag. */
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(AUDIENCES, { each: true })
  visibleTo!: (typeof AUDIENCES)[number][];

  /** "Give both discovery and transactional option and let the client
   *  choose" — a per-listing choice. */
  @IsOptional()
  @IsIn(ENGAGEMENT_MODES)
  engagementMode?: (typeof ENGAGEMENT_MODES)[number];
}

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
