import { IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class PreviewAllocationDto {
  @IsString()
  @MinLength(1)
  variantId: string;

  @IsString()
  @MinLength(1)
  locationId: string;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  preferredLotId?: string;
}
