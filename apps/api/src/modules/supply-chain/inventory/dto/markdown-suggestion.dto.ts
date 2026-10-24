import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import type { MarkdownSuggestionStatus } from '../../../../core/prisma/client';

const STATUSES: MarkdownSuggestionStatus[] = ['PENDING', 'CREATED', 'DISMISSED'];

export class MarkdownSuggestionQueryDto {
  @ApiPropertyOptional({ enum: STATUSES, description: 'Defaults to PENDING' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: MarkdownSuggestionStatus;
}
