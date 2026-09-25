import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { MarkdownSuggestionQueryDto } from './dto/markdown-suggestion.dto';
import { MarkdownSuggestionsService } from './markdown-suggestions.service';

/**
 * WO-9.8's review queue — "a person activates it" (the doc's own words):
 * nothing here ever creates or changes a Discount without this screen's own
 * explicit action.
 */
@ApiTags('admin/inventory')
@Controller('admin/inventory/markdown-suggestions')
@RequirePermission('inventory.manage')
export class MarkdownSuggestionsController {
  constructor(private readonly suggestions: MarkdownSuggestionsService) {}

  @Get()
  @ApiOperation({ summary: 'The markdown review queue' })
  list(@Query() query: MarkdownSuggestionQueryDto) {
    return this.suggestions.list(query.status);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Create the suggested discount (product-wide) and close this suggestion' })
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suggestions.activate(id, user.id);
  }

  @Post(':id/dismiss')
  @ApiOperation({ summary: 'Close this suggestion without creating a discount' })
  dismiss(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suggestions.dismiss(id, user.id);
  }
}
