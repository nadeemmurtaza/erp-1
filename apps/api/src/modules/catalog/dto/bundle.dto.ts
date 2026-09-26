import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class BundleComponentDto {
  @IsString()
  componentVariantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateBundleDto {
  @IsString()
  variantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BundleComponentDto)
  components!: BundleComponentDto[];
}

export class UpdateBundleDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BundleComponentDto)
  components?: BundleComponentDto[];
}
