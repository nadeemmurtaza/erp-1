import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LOCALES, OPTION_DISPLAYS, type OptionDisplay } from '@newax/shared';

export class OptionValueTranslationDto {
  @ApiProperty({ enum: LOCALES })
  @IsIn([...LOCALES])
  locale!: 'en' | 'ur';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;
}

export class UpsertOptionValueDto {
  @ApiProperty({ description: 'Stable machine key, e.g. "m", "navy". Never shown to a customer.' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swatchHex?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swatchUrl?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiProperty({ type: [OptionValueTranslationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OptionValueTranslationDto)
  translations!: OptionValueTranslationDto[];
}

export class OptionTranslationDto extends OptionValueTranslationDto {}

export class CreateProductOptionDto {
  @ApiProperty({ description: 'Stable machine key, e.g. "size", "sleeve_length". Never shown to a customer.' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiPropertyOptional({ enum: OPTION_DISPLAYS, default: 'BUTTON' })
  @IsOptional()
  @IsIn([...OPTION_DISPLAYS])
  display?: OptionDisplay;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiProperty({ type: [OptionTranslationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OptionTranslationDto)
  translations!: OptionTranslationDto[];

  @ApiPropertyOptional({ type: [UpsertOptionValueDto], description: 'Initial values, if any.' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertOptionValueDto)
  values?: UpsertOptionValueDto[];
}

export class CreateOptionTemplateDto extends CreateProductOptionDto {}

export class InstantiateTemplateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @ApiPropertyOptional({ description: 'Override the order this option is inserted at on the product.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
