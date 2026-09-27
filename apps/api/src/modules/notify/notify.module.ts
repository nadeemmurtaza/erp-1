import { Module } from '@nestjs/common';
import { AudienceService } from './audience.service';
import { EscalationRuleController } from './escalation-rule.controller';
import { EscalationRuleService } from './escalation-rule.service';
import { EscalationCron } from './escalation.cron';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { NotifyController } from './notify.controller';
import { NotifyService } from './notify.service';

/**
 * tasks-notifications-support/24-internal-notifications-meetings-escalation.md
 * (DECISIONS.md ADR-060). Imports no other feature module: reads `Position`/
 * `Posting`/`Rank`/`OrgUnit` (hr/orgstructure) and `Task` (tasks) directly
 * through Prisma, the identical no-coupling shape `AttendanceModule`'s and
 * `TasksModule`'s own header comments already document. Delivery is
 * `NotificationsService` (core, global) unchanged; the countersignature
 * workflow is `ApprovalService` (core, global) unchanged — no second
 * delivery mechanism, no second approval engine.
 *
 * `EscalationCron` has no other injector in this module — like
 * `OutboxDispatcher`/`IdempotencyCron` elsewhere in this codebase, it is a
 * self-initialising provider Nest still boots and runs its own `@Cron`
 * lifecycle hook on as long as it is listed here.
 */
@Module({
  controllers: [NotifyController, MeetingsController, EscalationRuleController],
  providers: [AudienceService, NotifyService, MeetingsService, EscalationRuleService, EscalationCron],
})
export class NotifyModule {}
