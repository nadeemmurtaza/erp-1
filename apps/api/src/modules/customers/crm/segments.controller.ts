import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { SegmentsService } from './segments.service';
import { CreateSegmentDto, PreviewSegmentFilterDto, UpdateSegmentDto } from './dto/segment.dto';

@ApiTags('admin/crm/segments')
@Controller('admin/crm/segments')
@RequirePermission('crm.manage')
export class SegmentsAdminController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  list() {
    return this.segments.listSegments();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.segments.getSegment(id);
  }

  @Post()
  create(@Body() dto: CreateSegmentDto, @CurrentUser('id') userId: string) {
    return this.segments.createSegment(dto, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    return this.segments.updateSegment(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.segments.deleteSegment(id);
  }

  @Get(':id/members')
  members(@Param('id') id: string) {
    return this.segments.resolveMembers(id);
  }

  @Post('preview')
  async preview(@Body() dto: PreviewSegmentFilterDto) {
    return { count: await this.segments.previewCount(dto.filter) };
  }
}
