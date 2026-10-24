import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES } from '@newax/shared';

export class LabelTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty({ example: 'Karachi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;
}

export class CreateShippingZoneDto {
  @ApiProperty({ example: 'karachi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key!: string;

  @ApiPropertyOptional({ type: [String], description: 'Matched case-insensitively; empty = the catch-all zone' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ description: 'Exactly one zone may be the fallback — setting this clears it on every other zone' })
  @IsOptional()
  @IsBoolean()
  isCatchAll?: boolean;

  @ApiProperty({ type: [LabelTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabelTranslationDto)
  translations!: LabelTranslationDto[];
}

export class UpdateShippingZoneDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCatchAll?: boolean;

  @ApiPropertyOptional({ type: [LabelTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabelTranslationDto)
  translations?: LabelTranslationDto[];
}

export class CreateShippingMethodDto {
  @ApiProperty({ example: 'standard' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key!: string;

  @ApiPropertyOptional({ description: 'Preferred CourierProvider.key for this method' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  courierKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMinDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMaxDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiProperty({ type: [LabelTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabelTranslationDto)
  translations!: LabelTranslationDto[];
}

export class UpdateShippingMethodDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  courierKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMinDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  etaMaxDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [LabelTranslationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabelTranslationDto)
  translations?: LabelTranslationDto[];
}

const RATE_TYPES = ['FLAT', 'BY_WEIGHT', 'BY_PRICE', 'BY_ITEM'] as const;

export class CreateShippingRateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  methodId!: string;

  @ApiPropertyOptional({ enum: RATE_TYPES, default: 'FLAT' })
  @IsOptional()
  @IsIn(RATE_TYPES)
  type?: (typeof RATE_TYPES)[number];

  @ApiProperty({ description: 'Paisa — per unit above includedUnits for BY_WEIGHT/BY_ITEM' })
  @IsInt()
  @Min(0)
  fee!: number;

  @ApiPropertyOptional({ description: 'Paisa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  baseFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  includedUnits?: number;

  @ApiPropertyOptional({ description: 'Paisa — order subtotal above which this rate is free' })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeAbove?: number;

  @ApiPropertyOptional({ description: 'BY_PRICE band lower bound, paisa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minValue?: number;

  @ApiPropertyOptional({ description: 'BY_PRICE band upper bound, paisa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxValue?: number;
}

export class UpdateShippingRateDto {
  @ApiPropertyOptional({ enum: RATE_TYPES })
  @IsOptional()
  @IsIn(RATE_TYPES)
  type?: (typeof RATE_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  fee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  baseFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  includedUnits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  freeAbove?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateShippingClassDto {
  @ApiProperty({ example: 'fragile' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  key!: string;

  @ApiPropertyOptional({ description: 'Paisa, added per unit of this class in the order' })
  @IsOptional()
  @IsInt()
  @Min(0)
  handlingFee?: number;

  @ApiProperty({ type: [LabelTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabelTranslationDto)
  translations!: LabelTranslationDto[];
}

export class UpdateShippingClassDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  handlingFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ShippingQuoteQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  city!: string;

  @ApiProperty({ description: 'Paisa' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotal!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  methodKey?: string;

  @ApiPropertyOptional({ description: 'Grams' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  weightGrams?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  itemCount?: number;
}
