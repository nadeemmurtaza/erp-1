import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StitchingRequestDto {
  @ApiProperty({ description: 'A STITCHING_SERVICE product id' })
  @IsString()
  @IsNotEmpty()
  stitchingServiceId!: string;

  @ApiPropertyOptional({
    description:
      'Saved measurement profile. Can be added later, but checkout requires it.',
  })
  @IsOptional()
  @IsString()
  measurementProfileId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Chosen style option ids' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  optionIds?: string[];

  @ApiPropertyOptional({ description: 'Anything the tailor should know' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
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
