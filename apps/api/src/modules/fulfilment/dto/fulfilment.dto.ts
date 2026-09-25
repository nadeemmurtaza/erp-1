import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, MaxLength } from 'class-validator';

const SHIPMENT_STATUSES = ['PENDING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'LOST'] as const;

export class CreateShipmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @ApiPropertyOptional({ description: 'CourierProvider.key — defaults to "manual"' })
  @IsOptional()
  @IsString()
  providerKey?: string;

  @ApiPropertyOptional({ description: 'Free-text display label — which physical courier this went with' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  courier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  methodId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weightGrams?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  packageCount?: number;

  @ApiPropertyOptional({ description: 'Line items this shipment covers — omit to cover the whole order' })
  @IsOptional()
  @IsArray()
  items?: Array<{ orderItemId: string; quantity: number }>;
}

export class RecordShipmentStatusDto {
  @ApiProperty({ enum: SHIPMENT_STATUSES })
  @IsIn(SHIPMENT_STATUSES)
  status!: (typeof SHIPMENT_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateManifestDto {
  @ApiProperty({ description: 'CourierProvider.key this pickup is for' })
  @IsString()
  @IsNotEmpty()
  courierKey!: string;

  @ApiPropertyOptional({ type: [String], description: 'Shipment ids to add immediately' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shipmentIds?: string[];
}

export class AddToManifestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  shipmentIds!: string[];
}
