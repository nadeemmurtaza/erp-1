import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, Matches } from 'class-validator';

export class CreateTaxClassDto {
  @ApiProperty({ example: 'standard' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key must be lowercase letters, digits and underscores only',
  })
  key!: string;

  @ApiProperty({ example: 'Standard rate' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  /** Starts the class with an active rate — most classes are created with one. */
  @ApiPropertyOptional({ description: 'Basis points, e.g. 1700 for 17%.' })
  @IsInt()
  @Min(0)
  @IsOptional()
  rateBps?: number;
}

export class UpdateTaxClassDto extends PartialType(CreateTaxClassDto) {}

export class CreateTaxRateDto {
  @ApiProperty({ description: 'Basis points, e.g. 1700 for 17%.' })
  @IsInt()
  @Min(0)
  rateBps!: number;
}

export class UpdateTaxSettingsDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['INCLUSIVE', 'EXCLUSIVE'] })
  @IsIn(['INCLUSIVE', 'EXCLUSIVE'])
  @IsOptional()
  pricingMode?: 'INCLUSIVE' | 'EXCLUSIVE';

  @ApiPropertyOptional({ description: 'A TaxClass.key' })
  @IsString()
  @IsOptional()
  defaultClass?: string;
}
