import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** The RTW size matrix's six tokens. Purely a label the customer picked from — see GarmentSizeChart. */
const SIZE_TOKENS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

export class StitchingRequestDto {
  @ApiPropertyOptional({
    description:
      'The garment being made. Required unless a stitching service names one.',
  })
  @IsOptional()
  @IsString()
  garmentTypeId?: string;

  @ApiPropertyOptional({
    description:
      'A STITCHING_SERVICE product id. Optional: without one the garment is priced from its own stitchingPrice.',
  })
  @IsOptional()
  @IsString()
  stitchingServiceId?: string;

  @ApiPropertyOptional({
    description: 'A saved measurement profile. Mutually exclusive with measurementValues.',
  })
  @IsOptional()
  @IsString()
  measurementProfileId?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Measurements typed into the panel: field key -> value. What guests send, having no profile to pick.',
  })
  @IsOptional()
  @IsObject()
  measurementValues?: Record<string, number>;

  @ApiPropertyOptional({ type: [String], description: 'Chosen style option ids' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  optionIds?: string[];

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Option group key -> the customer describing that design area in their own words.',
  })
  @IsOptional()
  @IsObject()
  customDesignText?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Anything the tailor should know' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    enum: SIZE_TOKENS,
    description:
      'Which size-chart column the customer measured against, if any. Informational only — never affects pricing or which measurementValues are used.',
  })
  @IsOptional()
  @IsIn(SIZE_TOKENS)
  sizeToken?: (typeof SIZE_TOKENS)[number];
}

export class AddCartItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number = 1;

  @ApiPropertyOptional({
    type: StitchingRequestDto,
    description: 'Present when the customer ticked "get it stitched"',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StitchingRequestDto)
  stitching?: StitchingRequestDto;
}

export class UpdateCartItemDto {
  @ApiPropertyOptional({ minimum: 0, description: '0 removes the line' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Attach or change the measurement profile' })
  @IsOptional()
  @IsString()
  measurementProfileId?: string;
}

export class MergeCartDto {
  @ApiProperty({ description: 'The guest cart token to fold into this account' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
