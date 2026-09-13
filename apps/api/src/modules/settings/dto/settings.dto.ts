import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PERMISSION_KEYS, type PermissionKey } from '@newax/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateRolePermissionsDto {
  @ApiProperty({ enum: PERMISSION_KEYS, isArray: true })
  @IsArray()
  @IsIn(PERMISSION_KEYS, { each: true })
  permissionKeys!: PermissionKey[];
}

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter to one entity type, e.g. "Order".' })
  @IsOptional()
  @IsString()
  entity?: string;

  @ApiPropertyOptional({ description: 'Filter to entries by this actor.' })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class UpdateMediaSettingsDto {
  @ApiProperty({
    description:
      'Convert new image uploads to WebP. Off keeps the original bytes; images already stored are unaffected either way.',
    example: true,
  })
  @IsBoolean()
  webpEnabled!: boolean;
}

class DocumentPrefixesDto {
  @ApiPropertyOptional({ example: 'YSN' }) @IsOptional() @IsString() @MaxLength(8) order?: string;
  @ApiPropertyOptional({ example: 'PO' }) @IsOptional() @IsString() @MaxLength(8) purchaseOrder?: string;
  @ApiPropertyOptional({ example: 'GRN' }) @IsOptional() @IsString() @MaxLength(8) goodsReceipt?: string;
  @ApiPropertyOptional({ example: 'STO' }) @IsOptional() @IsString() @MaxLength(8) stitchingOrder?: string;
  @ApiPropertyOptional({ example: 'JOB' }) @IsOptional() @IsString() @MaxLength(8) stitchingJob?: string;
  @ApiPropertyOptional({ example: 'SC' }) @IsOptional() @IsString() @MaxLength(8) stockCount?: string;
}

export class UpdateDocumentSettingsDto {
  @ApiPropertyOptional({
    enum: ['text', 'site', 'custom'],
    description:
      "What a receipt, invoice or email shows at the top. 'text' sets the shop name as type, which is what most readers see — mail clients block hosted images by default.",
  })
  @IsOptional()
  @IsIn(['text', 'site', 'custom'])
  logoSource?: 'text' | 'site' | 'custom';

  @ApiPropertyOptional({ description: "Used only when logoSource is 'custom'." })
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @ApiPropertyOptional({ type: DocumentPrefixesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentPrefixesDto)
  prefixes?: DocumentPrefixesDto;
}
