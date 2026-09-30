import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRequisitionLineDto {
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  estimatedUnitCostMinor?: number;
}

export class CreateRequisitionDto {
  /** Named explicitly, never defaulted — a requisition raised with no stated location is refused, never silently assigned to InventoryService.defaultLocationId(). */
  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsString()
  @IsNotEmpty()
  justification: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionLineDto)
  lines: CreateRequisitionLineDto[];
}

export class DecideRequisitionDto {
  @IsString()
  @IsOptional()
  comment?: string;
}

export class ConvertRequisitionDto {
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  /** variantId -> agreed unit cost in paisa. Falls back to the line's own estimatedUnitCostMinor, then the supplier's lastCost, when a variant is not named here. */
  @IsOptional()
  priceOverrides?: Record<string, number>;
}
