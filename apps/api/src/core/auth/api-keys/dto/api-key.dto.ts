import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  API_KEY_MAX_LIFETIME_DAYS,
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_SURFACES,
  CUSTOMER_SCOPE_KEYS,
  PERMISSION_KEYS,
  type ApiKeySurface,
} from '@newax/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { API_KEY_STATUSES, type ApiKeyStatus } from '../api-keys.service';

/*
 * Shape and bounds only. Whether a permission may go into a key — is it
 * delegatable, does its owner hold it right now — is ApiKeysService's
 * decision, against the owner's live permissions, never the DTO's.
 */

export class CreateApiKeyDto {
  @ApiProperty({ enum: API_KEY_SURFACES, description: 'ADMIN keys carry permissions; STOREFRONT keys carry customer scopes.' })
  @IsIn(API_KEY_SURFACES)
  surface!: ApiKeySurface;

  @ApiProperty({ example: 'Order export script', maxLength: API_KEY_NAME_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(API_KEY_NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({ type: [String], description: 'ADMIN keys only — PERMISSION_CATALOG keys you hold and may delegate.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PERMISSION_KEYS.length)
  @IsString({ each: true })
  permissionKeys?: string[];

  @ApiPropertyOptional({ type: [String], description: 'STOREFRONT keys only — CUSTOMER_SCOPE_CATALOG keys.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOMER_SCOPE_KEYS.length)
  @IsString({ each: true })
  customerScopes?: string[];

  @ApiProperty({ minimum: 1, maximum: API_KEY_MAX_LIFETIME_DAYS, example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(API_KEY_MAX_LIFETIME_DAYS)
  expiresInDays!: number;
}

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ maxLength: API_KEY_NAME_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(API_KEY_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ type: [String], description: 'Replaces an ADMIN key’s permissions — re-checked against what you hold now.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PERMISSION_KEYS.length)
  @IsString({ each: true })
  permissionKeys?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Replaces a STOREFRONT key’s scopes.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOMER_SCOPE_KEYS.length)
  @IsString({ each: true })
  customerScopes?: string[];
}

export class RotateApiKeyDto {
  @ApiProperty({ minimum: 1, maximum: API_KEY_MAX_LIFETIME_DAYS, example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(API_KEY_MAX_LIFETIME_DAYS)
  expiresInDays!: number;
}

export class ListMyApiKeysQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: API_KEY_SURFACES })
  @IsIn(API_KEY_SURFACES)
  surface!: ApiKeySurface;
}

export class ListApiKeysQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: API_KEY_SURFACES })
  @IsOptional()
  @IsIn(API_KEY_SURFACES)
  surface?: ApiKeySurface;

  @ApiPropertyOptional({ enum: API_KEY_STATUSES })
  @IsOptional()
  @IsIn(API_KEY_STATUSES)
  status?: ApiKeyStatus;
}
