import { IsString, IsNotEmpty, IsNumber, IsOptional, IsIn, ValidateNested, IsArray, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

const SCOPE_LEVELS = ['ORG', 'BRAND', 'BRANCH'] as const;

export class CreatePurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @IsNumber()
  @Min(1)
  quantityOrdered: number;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  freightCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  dutyCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  otherCost?: number;

  @IsDateString()
  @IsOptional()
  expectedAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** RETAIL-ERP.md R13/ADR-021. Omit for BRAND (the default — "brand purchasing is the default and behaves as today"). ORG names org-central buying; BRANCH names branch-local purchasing, gated by BrandPolicy.allowBranchLocalPurchasing. */
  @IsIn(SCOPE_LEVELS)
  @IsOptional()
  scopeLevel?: (typeof SCOPE_LEVELS)[number];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items: CreatePurchaseOrderItemDto[];
}

export class ReceiveGoodsItemDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  /// 32-lots-batch-expiry-fefo.md WO-32.3. Required only when the receiving
  /// screen shows this line as lot-tracked (`ProductVariant.lotTracked`) —
  /// validated against that flag in the service, not here, since the DTO
  /// cannot see the variant.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lotCode?: string;

  @IsOptional()
  @IsDateString()
  expiresOn?: string;

  /// 158-serialized-unit-tracking.md WO-158.4. Required, one per physical
  /// unit, only when this line's variant has `tracksSerials: true` — the
  /// count must match `quantity` exactly (§2's own refusal rule).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class ReceiveGoodsDto {
  @IsNumber()
  @IsOptional()
  @Min(0)
  freightCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  dutyCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  otherCost?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Where the goods actually landed. Omit for the shop's one default Location — WO-23.3's org-warehouse receiving names this explicitly. */
  @IsString()
  @IsOptional()
  locationId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveGoodsItemDto)
  items: ReceiveGoodsItemDto[];
}

