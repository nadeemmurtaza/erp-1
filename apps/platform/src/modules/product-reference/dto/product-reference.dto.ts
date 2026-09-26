import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES } from '@newax/shared';

export class ProductReferenceTranslationDto {
  @IsIn([...LOCALES])
  locale!: (typeof LOCALES)[number];

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  careInstructions?: string;
}

export class ProductReferenceImageDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  /** Mandatory — doc 03's own enforced-alt-text gate, unchanged here. */
  @IsString()
  @IsNotEmpty()
  altText!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/**
 * `POST /marketplace/v1/product-references` — registers a brand-new
 * barcode. `registeredByTenantId` is never accepted here; it is always the
 * calling tenant, resolved from `MarketplaceCredentialGuard`
 * (`product-reference.controller.ts`), the same "never trust the client
 * for who is acting" rule as everywhere else `@RequirePermission`d.
 */
export class RegisterProductReferenceDto {
  /** The GTIN/UPC/EAN off the box — digits only, 8 to 14 characters
   *  (UPC-E/EAN-8 through GTIN-14), matching the range GS1 actually issues. */
  @IsString()
  @Matches(/^\d{8,14}$/, { message: 'barcode must be 8-14 digits' })
  barcode!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceTranslationDto)
  translations!: ProductReferenceTranslationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceImageDto)
  images?: ProductReferenceImageDto[];

  /** Sector-varying descriptive details (fabric, season, dimensions, …) —
   *  a plain JSON bag, never validated against a fixed shape here; each
   *  sector pack owns its own namespace inside it (see marketplace.prisma's
   *  own doc comment on `GlobalProductReference.attributes`). */
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

/**
 * `PATCH /marketplace/v1/product-references/:id` — the registering
 * tenant only (`ProductReferenceService.update()`'s own toxic-pair
 * refusal). Barcode is immutable once registered: it is the join key
 * every linked tenant's own cache is keyed against indirectly through
 * `referenceId`, and changing it would silently orphan every existing
 * link.
 */
export class UpdateProductReferenceDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceTranslationDto)
  translations?: ProductReferenceTranslationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceImageDto)
  images?: ProductReferenceImageDto[];

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}

/** `POST /marketplace/v1/product-references/:id/link` — the calling
 *  tenant links one of their own `ProductVariant`s to this reference.
 *  `variantRef` is opaque to the platform, exactly as
 *  `MarketplaceListing.externalRef` is in doc 165. */
export class LinkProductReferenceDto {
  @IsString()
  @IsNotEmpty()
  variantRef!: string;
}

/** `POST /marketplace/v1/product-references/:id/flags` — any tenant
 *  reporting a canonical record as wrong. Never mutates the record
 *  itself; see `GlobalProductReferenceFlag`'s own moderation-only design. */
export class FlagProductReferenceDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** `POST /marketplace/v1/product-references/bulk-lookup` — an offline
 *  deployment pre-warming its local cache ahead of expected stock, or
 *  refreshing a known set before going offline. Bounded at 200 per call so
 *  one request can never become an unbounded full-table scan. */
export class BulkLookupProductReferenceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  barcodes!: string[];
}
