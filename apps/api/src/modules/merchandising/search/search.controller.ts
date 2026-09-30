import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { isLocale } from '@newax/shared';
import { CurrentUser, Public, RequirePermission } from '../../../core/auth/decorators';
import { SearchService } from './search.service';
import { CreateSynonymDto, SearchQueryDto } from './dto/search.dto';

/** Uploaded file as Multer hands it over. */
interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('search')
@Controller('search')
@Public()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(@Query() query: SearchQueryDto, @CurrentUser('id') userId?: string) {
    return this.searchService.search(query, userId ?? null);
  }

  @Post('by-image')
  @ApiOperation({ summary: 'WO-9.5 — upload a photo, find the nearest products' })
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  searchByImage(
    @UploadedFile() file: UploadedImage | undefined,
    @Query('locale') locale: string | undefined,
    @CurrentUser('id') userId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Choose a photo to upload.');
    }
    return this.searchService.searchByImage(file, locale && isLocale(locale) ? locale : 'en', userId ?? null);
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
