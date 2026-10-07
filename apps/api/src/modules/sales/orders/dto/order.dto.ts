import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { COD_RISK_ACTIONS, ORDER_STATUSES } from '@newax/shared';

/** `product-query.dto.ts`'s own comma-separated-list transform, reused
 *  rather than reinvented — WO-69.2's "Voided" segment is CANCELLED +
 *  RETURNED, which a single-value `status` filter cannot express. */
const csvToArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (typeof value !== 'string') return value as string[] | undefined;
  const parts = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
};
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

export class ShippingAddressDto {
  @ApiProperty({ example: 'Ayesha Khan' })
  @IsString()
  @IsNotEmpty({ message: 'Enter the name for delivery.' })
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: '03001234567' })
  @IsString()
  @IsNotEmpty({ message: 'The courier needs a phone number.' })
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ example: 'House 12, Street 5' })
  @IsString()
  @IsNotEmpty({ message: 'Enter the street address.' })
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ example: 'DHA Phase 6' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ example: 'Karachi', description: 'Decides the shipping zone' })
  @IsString()
  @IsNotEmpty({ message: 'Enter the city.' })
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: 'Sindh' })
  @IsString()
  @IsNotEmpty({ message: 'Enter the province.' })
  @MaxLength(80)
  province!: string;

  @ApiPropertyOptional({ example: '75500' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  postalCode?: string;
}

export class PlaceOrderDto {
  @ApiProperty({ type: ShippingAddressDto })
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;

  @ApiProperty({ example: 'cod', description: 'A key from /payments/methods' })
  @IsString()
  @IsNotEmpty({ message: 'Choose how you would like to pay.' })
  paymentMethod!: string;

  @ApiPropertyOptional({ description: 'For the order confirmation' })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;

  @ApiPropertyOptional({ description: 'Anything we should know about delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: 'A promotions promo code — validated and applied server-side (WO-5.3).' })
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({ description: 'A gift card code to apply as tender, after tax and shipping (WO-5.4).' })
  @IsOptional()
  @IsString()
  giftCardCode?: string;

  @ApiPropertyOptional({ description: 'Paisa of the gift card balance to apply. Required alongside giftCardCode.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  giftCardAmount?: number;

  @ApiPropertyOptional({ description: "Paisa of the signed-in customer's own store credit to apply as tender (WO-5.5)." })
  @IsOptional()
  @IsInt()
  @Min(1)
  storeCreditAmount?: number;

  @ApiPropertyOptional({
    description:
      "The buyer's own purchase-order number — required when paying on account against a B2BAccount with requiresPurchaseOrder set (149-b2b-accounts-approvals-sector-packs.md).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  purchaseOrderReference?: string;
}

export class TrackOrderDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class ChangeOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsIn([...ORDER_STATUSES])
  status!: (typeof ORDER_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminOrderQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ORDER_STATUSES,
    description: 'Comma-separated for more than one, e.g. "CANCELLED,RETURNED" — WO-69.2\'s own "Voided" bucket.',
  })
  @IsOptional()
  @Transform(csvToArray)
  @IsIn([...ORDER_STATUSES], { each: true })
  status?: (typeof ORDER_STATUSES)[number][];

  @ApiPropertyOptional({ enum: COD_RISK_ACTIONS, description: 'WO-9.4 — filter the queue to orders CodRiskService flagged for this action.' })
  @IsOptional()
  @IsIn([...COD_RISK_ACTIONS])
  codRiskAction?: (typeof COD_RISK_ACTIONS)[number];
}

export class OrderHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize: number = 20;
}
