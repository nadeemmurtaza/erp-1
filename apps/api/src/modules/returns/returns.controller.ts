import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { ReturnsService } from './returns.service';
import { DecideReturnRequestDto, ReturnRequestQueryDto } from './dto/return-request.dto';

@ApiTags('returns')
@Controller('admin/returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermission('returns.view')
  @ApiOperation({ summary: 'List self-service return requests' })
  async list(@Query() query: ReturnRequestQueryDto) {
    return this.returns.listForStaff(query);
  }

  @Patch(':id/decide')
  @RequirePermission('returns.manage')
  @ApiOperation({ summary: 'Approve or reject a return request' })
  async decide(@CurrentUser('id') actorId: string, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    return this.returns.decide(id, actorId, dto);
  }

  @Post(':id/mark-refunded')
  @RequirePermission('returns.manage')
  @ApiOperation({ summary: 'Close out an approved return once the refund is actually done' })
  async markRefunded(@Param('id') id: string) {
    return this.returns.markRefunded(id);
  }
}
