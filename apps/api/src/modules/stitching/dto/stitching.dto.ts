import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { STITCHING_STAGES } from '@yaseen/shared';

const STITCHING_ORDER_STATUSES = [
  'DRAFT',
  'AWAITING_FABRIC',
  'FABRIC_RECEIVED',
  'IN_PRODUCTION',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export class BookGarmentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  garmentTypeId!: string;

  @ApiPropertyOptional({ description: 'A saved profile; needs an account' })
  @IsOptional()
  @IsString()
  measurementProfileId?: string;

  @ApiPropertyOptional({
    description: 'Measurements typed in directly, for a customer with no account',
    example: { length: 42, chest: 38 },
  })
  @IsOptional()
  @IsObject()
  measurements?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

export class BookStitchingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Enter your name.' })
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: '03001234567' })
  @IsString()
  @IsNotEmpty({ message: 'We need a number to arrange collection.' })
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @ApiProperty({ type: [BookGarmentDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BookGarmentDto)
  garments!: BookGarmentDto[];

  @ApiPropertyOptional({ description: 'Where we collect the fabric' })
  @IsOptional()
  @IsObject()
  pickupAddress?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  deliveryAddress?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'What the fabric is, how much of it' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  fabricNotes?: string;
}

export class TrackStitchingDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class ChangeStageDto {
  @ApiProperty({ enum: STITCHING_STAGES })
  @IsIn([...STITCHING_STAGES])
  stage!: (typeof STITCHING_STAGES)[number];

  @ApiPropertyOptional({ description: 'Required when sending a job back a stage' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AssignJobDto {
  @ApiPropertyOptional({ description: 'Null unassigns the job' })
  @IsOptional()
  @IsString()
  tailorId?: string | null;
}

export class QuoteStitchingDto {
  @ApiProperty({ description: 'Fee in paisa' })
  @IsInt()
  @Min(0)
  fee!: number;
}

export class ChangeStitchingOrderStatusDto {
  @ApiProperty({ enum: STITCHING_ORDER_STATUSES })
  @IsIn([...STITCHING_ORDER_STATUSES])
  status!: (typeof STITCHING_ORDER_STATUSES)[number];
}

export class FabricReceivedDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// --- The design catalogue ----------------------------------------------------

/**
 * The body regions the storefront groups the style picker by. A group with no
 * area falls through to "other" at the end of the form.
 */
export const STITCHING_DESIGN_AREAS = [
  'neck',
  'sleeves',
  'upper_front',
  'lower_front',
  'back',
  'trouser',
  'finishing',
  'bodice',
  'skirt_panel',
  'outerwear',
] as const;

export type StitchingDesignArea = (typeof STITCHING_DESIGN_AREAS)[number];

const STITCHING_SELECTION_TYPES = ['SINGLE', 'MULTI'] as const;

export class CreateStitchingOptionGroupDto {
  @ApiProperty({ example: 'neckline' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelEn!: string;

  @ApiProperty({ description: 'Urdu label — the storefront is bilingual' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelUr!: string;

  @ApiPropertyOptional({
    description: 'Null offers the group on every garment',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  garmentTypeId?: string | null;

  @ApiPropertyOptional({ enum: STITCHING_DESIGN_AREAS, nullable: true })
  @IsOptional()
  @IsIn([...STITCHING_DESIGN_AREAS])
  area?: StitchingDesignArea | null;

  @ApiPropertyOptional({ enum: STITCHING_SELECTION_TYPES, default: 'SINGLE' })
  @IsOptional()
  @IsIn([...STITCHING_SELECTION_TYPES])
  selectionType?: (typeof STITCHING_SELECTION_TYPES)[number];

  @ApiPropertyOptional({ description: 'The customer must choose', default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Also show a free-text box for styles we cannot enumerate',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowCustomText?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpUr?: string | null;

  @ApiPropertyOptional({ description: 'Defaults to the end of the list' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStitchingOptionGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelUr?: string;

  @ApiPropertyOptional({
    description: 'Null offers the group on every garment',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  garmentTypeId?: string | null;

  @ApiPropertyOptional({ enum: STITCHING_DESIGN_AREAS, nullable: true })
  @IsOptional()
  @IsIn([...STITCHING_DESIGN_AREAS])
  area?: StitchingDesignArea | null;

  @ApiPropertyOptional({ enum: STITCHING_SELECTION_TYPES })
  @IsOptional()
  @IsIn([...STITCHING_SELECTION_TYPES])
  selectionType?: (typeof STITCHING_SELECTION_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowCustomText?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpEn?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpUr?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ description: 'Reactivates a group taken off the form' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateStitchingOptionDto {
  @ApiProperty({ example: 'round_neck' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelEn!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelUr!: string;

  @ApiPropertyOptional({
    description: 'Added to the stitching fee, in paisa. Negative for a cheaper style',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  priceDelta?: number;

  @ApiPropertyOptional({ description: 'A picture of the style', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Defaults to the end of the group' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStitchingOptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  labelUr?: string;

  @ApiPropertyOptional({ description: 'Paisa; may be negative' })
  @IsOptional()
  @IsInt()
  priceDelta?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ description: 'Reactivates an option taken off the form' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
