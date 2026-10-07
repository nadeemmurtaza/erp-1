import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ENTITY_ATTRIBUTE_VALUE_TYPES, type EntityAttributeValueType } from '../entity-attributes.service';

export class SetEntityAttributeDto {
  @ApiProperty({ description: 'A real Prisma model name — "Supplier", "Product" — validated against Prisma.ModelName at write time.' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @ApiProperty({ description: 'e.g. "certification_number" — snake_case.' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'attributeKey must be snake_case, starting with a letter.' })
  attributeKey!: string;

  @ApiProperty()
  @IsString()
  attributeValue!: string;

  @ApiPropertyOptional({ enum: ENTITY_ATTRIBUTE_VALUE_TYPES })
  @IsEnum(ENTITY_ATTRIBUTE_VALUE_TYPES)
  @IsOptional()
  valueType?: EntityAttributeValueType;
}
