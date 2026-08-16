import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateMeasurementProfileDto {
  @ApiProperty({ example: 'Ammi – kameez' })
  @IsString()
  @IsNotEmpty({ message: 'Give this profile a name, e.g. "Self" or "Ammi".' })
  @MaxLength(60)
  label!: string;

  @ApiProperty({ description: 'GarmentType id or key' })
  @IsString()
  @IsNotEmpty()
  garmentTypeId!: string;

  @ApiProperty({
    description: 'Measurement key -> value, validated against the garment fields',
    example: { length: 42, chest: 38, waist: 34, hips: 40, shoulder: 15 },
  })
  @IsObject()
  values!: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Preselect this profile for its garment' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateMeasurementProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  values?: Record<string, number>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class MeasurementFieldDto {
  @ApiProperty({ example: 'chest' })
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

  @ApiPropertyOptional({ enum: ['INCH', 'CM'], default: 'INCH' })
  @IsOptional()
  @IsIn(['INCH', 'CM'])
  unit?: 'INCH' | 'CM';

  @ApiProperty({ example: 24 })
  @IsNumber()
  @Min(0.25)
  min!: number;

  @ApiProperty({ example: 60 })
  @IsNumber()
  @Max(500)
  max!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  helpUr?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertGarmentTypeDto {
  @ApiProperty({ example: 'kameez' })
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

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [MeasurementFieldDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementFieldDto)
  fields?: MeasurementFieldDto[];
}
