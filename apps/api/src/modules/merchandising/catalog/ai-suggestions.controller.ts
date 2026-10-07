import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import type { AiSuggestionStatus } from '../../../core/prisma/client';
import { AiSuggestionsService } from './ai-suggestions.service';

const STATUSES: AiSuggestionStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

class ListQueueDto {
  @ApiPropertyOptional({ enum: STATUSES, description: 'Defaults to PENDING' })
  @IsOptional()
  @IsIn(STATUSES)
  status?: AiSuggestionStatus;
}

class ApproveBulkDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

/**
 * WO-9.1's review queue (09-ai-layer.md): every AI-drafted alt text, meta
 * title/description, product description and care-instruction sits here as a
 * PENDING ProductAiSuggestion until a person approves or rejects it — nothing
 * generated here ever reaches the storefront on its own. Gated by `ai.view`
 * (read the queue) and `ai.manage` (generate, approve, reject) rather than
 * `catalog.manage`, because that is what those two permissions are for.
 */
@ApiTags('admin/catalog/ai-suggestions')
@Controller('admin/catalog/ai-suggestions')
export class AiSuggestionsController {
  constructor(private readonly suggestions: AiSuggestionsService) {}

  @Get()
  @RequirePermission('ai.view', 'ai.manage')
  @ApiOperation({ summary: 'The AI draft review queue' })
  list(@Query() query: ListQueueDto) {
    return this.suggestions.listQueue(query.status ?? 'PENDING');
  }

  @Post('generate/:productId')
  @RequirePermission('ai.manage')
  @ApiOperation({ summary: 'Draft alt text and SEO copy for one product, for every gap it currently has' })
  generate(@Param('productId') productId: string) {
    return this.suggestions.generateForProduct(productId);
  }

  @Post('generate-bulk')
  @RequirePermission('ai.manage')
  @ApiOperation({ summary: "Draft for every product failing the SEO publish gate (Catalogue -> SEO health)" })
  generateBulk() {
    return this.suggestions.generateBulk();
  }

  @Post(':id/approve')
  @RequirePermission('ai.manage')
  @ApiOperation({ summary: 'Apply a draft to the live product and mark it approved' })
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suggestions.approve(id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('ai.manage')
  @ApiOperation({ summary: 'Discard a draft without applying it' })
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suggestions.reject(id, user.id);
  }

  @Post('approve-bulk')
  @RequirePermission('ai.manage')
  @ApiOperation({ summary: 'Approve several drafts at once' })
  approveBulk(@CurrentUser() user: AuthenticatedUser, @Body() dto: ApproveBulkDto) {
    return this.suggestions.approveBulk(dto.ids, user.id);
  }
}
