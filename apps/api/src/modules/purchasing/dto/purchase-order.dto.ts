import { IsString, IsNotEmpty, IsNumber, IsOptional, ValidateNested, IsArray, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveGoodsItemDto)
  items: ReceiveGoodsItemDto[];
}

