import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedOnly, CurrentUser } from '../../core/auth/decorators';
import { NotificationPreferencesService } from '../../core/notifications/notification-preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/notification-preference.dto';

/**
 * WO-7.8. Transactional categories (order confirmation, payment result)
 * never appear here — they are not opt-out, so there is nothing to toggle.
 */
@ApiTags('notification-preferences')
@Controller('notification-preferences')
@AuthenticatedOnly()
export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'My notification preferences, per channel and category' })
  async list(@CurrentUser('id') userId: string) {
    return this.preferences.list(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update one or more preference cells' })
  async update(@CurrentUser('id') userId: string, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.preferences.update(userId, dto.updates);
  }
}
