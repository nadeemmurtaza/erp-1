import { Module } from '@nestjs/common';
import { NotificationPreferencesController } from './notification-preferences.controller';

/**
 * The service itself (`NotificationPreferencesService`) lives in
 * `core/notifications/` and is globally provided by `NotificationsModule` —
 * the same reason `SettingsService` lives in core rather than a feature
 * module, since any module that sends a notification needs to check a
 * preference without importing this one (module independence,
 * `MULTI-SECTOR.md`). This module registers only the customer-facing
 * controller so the capability still has its own togglable
 * `notification-preferences` module entry (module-packs.ts).
 */
@Module({
  controllers: [NotificationPreferencesController],
})
export class NotificationPreferencesModule {}
