import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BRAND } from '@newax/shared';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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
  @ApiPropertyOptional({ example: BRAND.commerce.orderNumberPrefix }) @IsOptional() @IsString() @MaxLength(8) order?: string;
  @ApiPropertyOptional({ example: 'PO' }) @IsOptional() @IsString() @MaxLength(8) purchaseOrder?: string;
  @ApiPropertyOptional({ example: 'GRN' }) @IsOptional() @IsString() @MaxLength(8) goodsReceipt?: string;
  @ApiPropertyOptional({ example: 'STO' }) @IsOptional() @IsString() @MaxLength(8) stitchingOrder?: string;
  @ApiPropertyOptional({ example: 'JOB' }) @IsOptional() @IsString() @MaxLength(8) stitchingJob?: string;
  @ApiPropertyOptional({ example: 'SC' }) @IsOptional() @IsString() @MaxLength(8) stockCount?: string;
  @ApiPropertyOptional({ example: 'AUC' }) @IsOptional() @IsString() @MaxLength(8) auction?: string;
  @ApiPropertyOptional({ example: 'INV' }) @IsOptional() @IsString() @MaxLength(8) invoice?: string;
  @ApiPropertyOptional({ example: 'QTE' }) @IsOptional() @IsString() @MaxLength(8) quote?: string;
}

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({
    description: 'Monthly AI spend cap, in paisa. null means uncapped — every AI call still gets logged either way.',
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyBudgetPaisa?: number | null;

  @ApiPropertyOptional({ description: 'USD-to-PKR rate used to estimate cost from a provider\'s per-token USD pricing.' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  usdToPkrRate?: number;
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
