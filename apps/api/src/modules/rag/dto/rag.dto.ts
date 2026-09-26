import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { MAX_PAGE_SIZE } from '../../../core/common/dto/pagination.dto';

const CORPUS_VALUES = ['EMPLOYEE_DOCUMENTS', 'SUPPLIER_CATALOG', 'BUSINESS_DOCUMENTS', 'KNOWLEDGE_BASE'] as const;
const STATUS_VALUES = ['QUEUED', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED'] as const;

export class UploadSourceDto {
  @ApiPropertyOptional({ enum: CORPUS_VALUES })
  @IsIn(CORPUS_VALUES)
  corpus!: (typeof CORPUS_VALUES)[number];

  /**
   * Optional and almost always omitted — see rag.prisma's header comment.
   * Present only for the Organization-tier context this codebase has not
   * built a resolver for yet (no cross-tenant user directory exists, the
   * same honest limit `MerchantPayableService.schedulePayoutRun()`'s own
   * comment already states for a comparable plain scalar); a caller that
   * has one supplies it explicitly, exactly like every other
   * `organizationId` parameter in this codebase (`MerchantPayableService
   * .createMerchantPayable()`).
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;
}

export class ListSourcesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = 20;

  @ApiPropertyOptional({ enum: CORPUS_VALUES })
  @IsOptional()
  @IsIn(CORPUS_VALUES)
  corpus?: (typeof CORPUS_VALUES)[number];

  @ApiPropertyOptional({ enum: STATUS_VALUES })
  @IsOptional()
  @IsIn(STATUS_VALUES)
  status?: (typeof STATUS_VALUES)[number];
}

export class RagQueryDto {
  @IsString()
  @MinLength(1)
  query!: string;

  @IsIn(CORPUS_VALUES)
  corpus!: (typeof CORPUS_VALUES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;
}
