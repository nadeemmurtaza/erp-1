import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
import { ORDER_STATUSES } from '@newax/shared';
import { PaginationQueryDto } from '../../../core/common/dto/pagination.dto';

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
  @ApiPropertyOptional({ enum: ORDER_STATUSES })
  @IsOptional()
  @IsIn([...ORDER_STATUSES])
  status?: (typeof ORDER_STATUSES)[number];
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
