import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { DecideBroadcastDto, PreviewAudienceDto, SendBroadcastDto } from './dto/notify.dto';
import { NotifyService } from './notify.service';

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (WO-24.2/24.5). `notify.send` covers an ordinary send within the
 * sender's own reach; an above-quorum send additionally needs
 * `notify.broadcast`, enforced inside `NotifyService.send()` since the
 * quorum threshold depends on the resolved audience, not the route alone.
 */
@ApiTags('admin/notify')
@Controller('admin/notify')
@RequirePermission('notify.send')
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Resolve an audience and report whether it needs a countersignature, without sending' })
  preview(@Body() dto: PreviewAudienceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notify.preview(dto, user.id);
  }

  @Post('send')
  @ApiOperation({ summary: 'Send an internal message, or submit it for countersignature if it is above the quorum' })
  send(@Body() dto: SendBroadcastDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notify.send(dto, user.id);
  }

  @Post(':id/decide')
  @ApiOperation({ summary: 'Countersign or reject a pending broadcast — only the person it was routed to may decide it' })
  decide(@Param('id') id: string, @Body() dto: DecideBroadcastDto, @CurrentUser() user: AuthenticatedUser) {
    return this.notify.decide(id, dto.decision, user.id, dto.comment);
  }
}
