import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { FIELD_METADATA_VALUE_TYPES, type FieldMetadataValueType } from '../metadata-forms.service';

export class FieldMetadataDto {
  @ApiProperty({ description: 'e.g. "certification_number" — snake_case, stable once a value is stored under it.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'key must be snake_case, starting with a letter.' })
  key!: string;

  @ApiProperty()
  @IsString()
  label!: string;

  @ApiProperty({ enum: FIELD_METADATA_VALUE_TYPES })
  @IsEnum(FIELD_METADATA_VALUE_TYPES)
  valueType!: FieldMetadataValueType;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Required when valueType is SELECT.', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  helpText?: string;
}

export class DefineFormMetadataDto {
  @ApiProperty({ type: [FieldMetadataDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FieldMetadataDto)
  fields!: FieldMetadataDto[];
}
