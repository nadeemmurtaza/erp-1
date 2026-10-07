import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Matches } from 'class-validator';
import { CUSTOM_FIELD_VALUE_TYPES, CUSTOM_FIELD_ENTITY_TYPES, type CustomFieldValueType, type CustomFieldEntityType } from '@newax/shared';

export class DefineCustomFieldDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITY_TYPES })
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType!: CustomFieldEntityType;

  @ApiProperty({ description: 'e.g. "carbon_footprint_kg" — snake_case, stable once other rows reference it.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'key must be snake_case, starting with a letter.' })
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: CUSTOM_FIELD_VALUE_TYPES })
  @IsEnum(CUSTOM_FIELD_VALUE_TYPES)
  valueType!: CustomFieldValueType;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;
}

export class SetCustomFieldValuesDto {
  @ApiProperty({ enum: CUSTOM_FIELD_ENTITY_TYPES })
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType!: CustomFieldEntityType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiProperty({ description: 'key -> value, one entry per CustomFieldDefinition being set.' })
  @IsObject()
  values!: Record<string, string | number | boolean | null>;
}
