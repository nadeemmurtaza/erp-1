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
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LOCALES } from '@yaseen/shared';

export class BrandTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty({ example: 'Gul Ahmed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpsertBrandDto {
  @ApiPropertyOptional({ description: 'Derived from the English name when omitted' })
  @IsOptional()
  @IsString()
  @MaxLength(90)
  slug?: string;

  @ApiPropertyOptional({ description: 'Brand mark shown on the storefront' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Lower sorts first in pickers and listings' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ description: 'Inactive brands stay on their products but leave the pickers' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [BrandTranslationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrandTranslationDto)
  translations!: BrandTranslationDto[];
}
