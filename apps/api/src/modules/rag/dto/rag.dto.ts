import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_PAGE_SIZE } from '../../../core/common/dto/pagination.dto';

const CORPUS_VALUES = ['EMPLOYEE_DOCUMENTS', 'SUPPLIER_CATALOG', 'BUSINESS_DOCUMENTS', 'KNOWLEDGE_BASE'] as const;
const STATUS_VALUES = ['QUEUED', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED'] as const;

export class UploadSourceDto {
  @ApiPropertyOptional({ enum: CORPUS_VALUES })
  @IsIn(CORPUS_VALUES)
  corpus!: (typeof CORPUS_VALUES)[number];

  // `organizationId` is deliberately NOT a field here (M4, security review):
  // a client-supplied tenant scope on a write is exactly the isolation bug
  // class doc 35 §4 rules out. See `rag-admin.controller.ts`'s own comment,
  // next to the literal `null` every call site now passes instead.
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
  // L17 (security review) — bounds the text handed to embedding/generation;
  // this DTO is shared by the cheap `query` debugging route and the far more
  // expensive `ask` route, so the cap has to hold for both.
  @MaxLength(2000)
  query!: string;

  @IsIn(CORPUS_VALUES)
  corpus!: (typeof CORPUS_VALUES)[number];

  // `organizationId` is deliberately NOT a field here (M4, security review)
  // — see `UploadSourceDto`'s own comment; the server always supplies it.

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;
}
