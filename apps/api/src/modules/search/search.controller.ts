import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, RequirePermission } from '../../core/auth/decorators';
import { SearchService } from './search.service';
import { CreateSynonymDto, SearchQueryDto } from './dto/search.dto';

@ApiTags('search')
@Controller('search')
@Public()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() query: SearchQueryDto, @CurrentUser('id') userId?: string) {
    return this.searchService.search(query, userId ?? null);
  }
}

@ApiTags('admin/search')
@Controller('admin/search')
export class SearchAdminController {
  constructor(private readonly search: SearchService) {}

  @Get('synonyms')
  @RequirePermission('search.view', 'search.manage')
  listSynonyms(@Query('locale') locale?: string) {
    return this.search.listSynonyms(locale);
  }

  @Post('synonyms')
  @RequirePermission('search.manage')
  createSynonym(@Body() dto: CreateSynonymDto) {
    return this.search.createSynonym(dto);
  }

  @Delete('synonyms/:id')
  @RequirePermission('search.manage')
  deleteSynonym(@Param('id') id: string) {
    return this.search.deleteSynonym(id);
  }

  @Get('zero-results')
  @RequirePermission('search.view', 'search.manage')
  zeroResults(@Query('days') days = '30') {
    return this.search.zeroResultReport(Number(days) || 30);
  }
}
