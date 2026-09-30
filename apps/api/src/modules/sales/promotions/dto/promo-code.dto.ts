import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../../core/common/dto/pagination.dto';

export class CreatePromoCodeDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  discountId!: string;

  @ApiPropertyOptional({ description: 'Stored and compared uppercase. Auto-generated when omitted.' })
  @IsString()
  @Matches(/^[A-Z0-9-]{3,32}$/i, { message: 'Codes are 3-32 letters, digits or hyphens.' })
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Single-customer code, e.g. a service-recovery gesture.' })
  @IsString()
  @IsOptional()
  restrictedToUserId?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}

export class UpdatePromoCodeDto extends PartialType(CreatePromoCodeDto) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BulkGeneratePromoCodesDto {
  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  discountId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5000 })
  @IsInt()
  @Min(1)
  @Max(5000)
  count!: number;

  @ApiPropertyOptional({ description: 'Prefixed to every generated code, e.g. "SUMMER24".' })
  @IsString()
  @Matches(/^[A-Z0-9]{0,16}$/i, { message: 'Prefix is up to 16 letters/digits.' })
  @IsOptional()
  prefix?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}

export class PromoCodeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  discountId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  batchId?: string;
}
