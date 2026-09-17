import { IsString, IsNotEmpty, IsNumber, IsOptional, ValidateNested, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BillOfMaterialLineDto {
  @IsString()
  @IsNotEmpty()
  componentVariantId: string;

  @IsNumber()
  @Min(0.01)
  quantityPerUnit: number;
}

export class UpsertBillOfMaterialDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillOfMaterialLineDto)
  components: BillOfMaterialLineDto[];
}
