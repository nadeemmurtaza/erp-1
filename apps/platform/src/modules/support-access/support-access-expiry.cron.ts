import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupportAccessService } from './support-access.service';

/** WO-39.5 — marks every grant whose `expiresAt` has passed as inert for
 *  display, on a short interval since a stale "still shown as live" grant
 *  on a hosting-ops list is itself a confusing (if not unsafe) state. */
@Injectable()
export class SupportAccessExpiryCron {
  private readonly logger = new Logger(SupportAccessExpiryCron.name);

  constructor(private readonly supportAccess: SupportAccessService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<void> {
    const count = await this.supportAccess.markExpiredInert();
    if (count > 0) this.logger.log(`Marked ${count} expired support access grant(s) inert`);
  }
}
