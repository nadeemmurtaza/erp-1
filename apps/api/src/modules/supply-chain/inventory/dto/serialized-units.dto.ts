import { IsOptional, IsString, MinLength } from 'class-validator';

export class SellSerializedUnitDto {
  @IsString()
  @MinLength(1)
  serialNumber: string;

  @IsString()
  @MinLength(1)
  orderId: string;
}

export class ReturnSerializedUnitDto {
  @IsString()
  @MinLength(1)
  serialNumber: string;

  @IsString()
  @MinLength(1)
  orderId: string;

  @IsString()
  @MinLength(1)
  locationId: string;
}

export class WriteOffSerializedUnitDto {
  @IsString()
  @MinLength(1)
  serialNumber: string;

  @IsOptional()
  @IsString()
  note?: string;
}
