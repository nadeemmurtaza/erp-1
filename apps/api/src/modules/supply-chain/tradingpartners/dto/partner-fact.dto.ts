import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * The fact types a partner may send (WO-213.1, 213-partner-fact-exchange.md).
 * A string list, not a database enum: a new type is a new entry here and a new
 * subscriber, never a migration.
 */
export const PARTNER_FACT_TYPES = [
  "sale.dispatched",
  "receipt.confirmed",
] as const;
export type PartnerFactType = (typeof PARTNER_FACT_TYPES)[number];

/** The shape version this deployment understands. The applier for version n is kept forever. */
export const PARTNER_FACT_SCHEMA_VERSIONS = [1] as const;

/**
 * 500 lines is about 85 KiB at roughly 170 bytes a line — inside the
 * platform's existing 100 KiB JSON body limit (Express default, unchanged),
 * and small enough to apply in one transaction. A larger dispatch is sent as
 * several facts.
 */
export const PARTNER_FACT_MAX_LINES = 500;

const MAX_INT = 2_000_000_000;

/**
 * One line of a fact. Which fields are required depends on the fact's `type`,
 * which class-validator cannot express across sibling properties, so the
 * per-type rules live in `PartnerFactInboxService.assertFactShape()`; this
 * class only bounds every field so nothing unbounded is ever stored.
 */
export class PartnerFactLineDto {
  @ApiPropertyOptional({
    description:
      "The barcode (GTIN/UPC/EAN, 8 to 14 digits) — the key that means the same product in every business.",
  })
  @IsOptional()
  @Matches(/^\d{8,14}$/, { message: "gtin must be 8 to 14 digits" })
  gtin?: string;

  @ApiPropertyOptional({
    description:
      "The sender's own SKU. Display and fallback matching only — SKUs are per business.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sellerSku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: "sale.dispatched: units shipped." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional({
    description:
      "sale.dispatched: price per unit in minor units (paisa), before tax.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INT)
  unitPriceMinor?: number;

  @ApiPropertyOptional({
    description:
      "sale.dispatched: tax on the whole line in minor units. Defaults to 0.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INT)
  taxMinor?: number;

  @ApiPropertyOptional({
    description: "receipt.confirmed: units actually counted in.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantityDelivered?: number;
}

export class SubmitPartnerFactDto {
  @ApiProperty({
    description:
      "A UUID v4 the SENDER generated. The same factId is always the same fact: a retry sends it again unchanged.",
  })
  @IsUUID("4")
  factId!: string;

  @ApiProperty({ enum: PARTNER_FACT_TYPES })
  @IsIn(PARTNER_FACT_TYPES)
  type!: PartnerFactType;

  @ApiProperty({ enum: PARTNER_FACT_SCHEMA_VERSIONS })
  @IsIn(PARTNER_FACT_SCHEMA_VERSIONS)
  schemaVersion!: number;

  @ApiProperty({
    description:
      "When it happened at the sender (ISO 8601), not when it was sent.",
  })
  @IsISO8601({ strict: true })
  occurredAt!: string;

  @ApiPropertyOptional({
    description:
      "The sender's own document number, e.g. their invoice number. Recorded for reconciliation; never reused as one of ours.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  documentRef?: string;

  @ApiPropertyOptional({
    description: "sale.dispatched: ISO 4217 currency of the prices.",
  })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/, {
    message: "currency must be an ISO 4217 code such as PKR",
  })
  currency?: string;

  @ApiPropertyOptional({
    description:
      "receipt.confirmed: the factId of the sale.dispatched fact being answered.",
  })
  @IsOptional()
  @IsUUID("4")
  inReplyToFactId?: string;

  @ApiProperty({ type: [PartnerFactLineDto] })
  @ValidateNested({ each: true })
  @Type(() => PartnerFactLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(PARTNER_FACT_MAX_LINES)
  lines!: PartnerFactLineDto[];
}
