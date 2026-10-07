import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/** The GTIN/UPC/EAN format the platform's own registry enforces —
 *  mirrored here so a malformed value never reaches an outbound call. */
export const BARCODE_PATTERN = /^\d{8,14}$/;

/** `GET /admin/marketplace/product-references/lookup?barcode=` — the
 *  autofill trigger (166-unified-product-reference-registry.md WO-166.3). */
export class LookupProductReferenceQueryDto {
  @IsString()
  @Matches(BARCODE_PATTERN, { message: 'barcode must be 8-14 digits' })
  barcode!: string;
}

/** `POST /admin/marketplace/product-references/apply` — "Fill from shared
 *  listing?" accepted (WO-166.3). Takes only the variant id: the server
 *  re-fetches the canonical reference by that variant's own barcode rather
 *  than trusting client-supplied translation/image content as "coming from
 *  the registry" — the same never-trust-the-client boundary as everywhere
 *  else a server-authoritative fact is written. */
export class ApplyProductReferenceDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;
}

/** `POST /admin/marketplace/product-references/register` — a genuinely new
 *  barcode with no existing reference. Same shape as `apply`: only the
 *  variant id; the server derives what to register from the just-saved
 *  product itself. */
export class RegisterProductReferenceDto {
  @IsString()
  @IsNotEmpty()
  variantId!: string;
}

export class ProductReferenceSyncTranslationDto {
  @IsString()
  @IsNotEmpty()
  locale!: string;

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

export class ProductReferenceSyncImageDto {
  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  altText!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/**
 * The body of a push delivery this tenant receives at
 * `POST /webhooks/marketplace/product-reference-sync`, once the platform
 * side of WO-166.4's fan-out is built. Shaped exactly like the platform's
 * own `ReferenceWithDetails` (product-reference.service.ts) so a future
 * dispatcher can send that response body unchanged.
 */
export class ProductReferenceSyncPayloadDto {
  @IsString()
  @IsNotEmpty()
  referenceId!: string;

  @IsString()
  @Matches(BARCODE_PATTERN, { message: 'barcode must be 8-14 digits' })
  barcode!: string;

  @IsISO8601()
  updatedAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceSyncTranslationDto)
  translations!: ProductReferenceSyncTranslationDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductReferenceSyncImageDto)
  images?: ProductReferenceSyncImageDto[];
}
