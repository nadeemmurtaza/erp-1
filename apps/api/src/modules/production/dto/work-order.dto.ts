import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateWorkOrderDto {
  @IsString()
  @IsNotEmpty()
  variantId: string;

  @IsNumber()
  @Min(1)
  quantityOrdered: number;

  @IsString()
  @IsOptional()
  locationId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CompleteWorkOrderDto {
  @IsNumber()
  @Min(1)
  quantityCompleted: number;
}
