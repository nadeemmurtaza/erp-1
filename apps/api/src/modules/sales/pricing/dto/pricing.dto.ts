import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

export class PriceListEntryDto {
  @IsString()
  variantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  minQuantity?: number;

  @IsInt()
  @Min(0)
  unitPriceMinor!: number;
}

export class CreatePriceListDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'key must be lowercase, digits and hyphens only, e.g. "wholesale-standard"' })
  key!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListEntryDto)
  entries?: PriceListEntryDto[];
}

export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListEntryDto)
  entries?: PriceListEntryDto[];
}

/** Exactly one of the two must be set — enforced in `PricingService.setAssignment()`. */
export class SetPriceListAssignmentDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  tagId?: string;
}

export class PreviewPriceDto {
  @IsString()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  customerId?: string;
}

export class PriceListEntryQuantityDto {
  @IsString()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class BatchPreviewPriceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PriceListEntryQuantityDto)
  items!: PriceListEntryQuantityDto[];

  @IsOptional()
  @IsString()
  customerId?: string;
}
