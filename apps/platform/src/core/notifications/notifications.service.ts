import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

/**
 * The one place every module in this app resolves "who do we tell" through
 * — doc 39/50/51's own repeated "audience is a capability, not an address"
 * lens made concrete. Every caller passes a recipient it already resolved
 * from a real column (`PlatformTenant.billingContactEmail`) or from config
 * (`PLATFORM_OPS_ALERT_EMAIL`), never a literal string.
 *
 * Failure mode: SMTP unset or unreachable never throws back into the
 * caller — a quota check, a trial-expiry sweep or a billing run must not
 * fail its own state transition because a notification could not be sent.
 * It logs instead, which is this app's own "observable" pillar (structured
 * `Logger`, no APM wired yet) doing the job an alert-delivery failure
 * would otherwise hide silently.
 */
@Injectable()
export class PlatformNotificationsService {
  private readonly logger = new Logger(PlatformNotificationsService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  private getTransporter(): Transporter | null {
    const host = this.config.get('PLATFORM_SMTP_HOST');
    if (!host) return null;
    if (!this.transporter) {
      this.transporter = createTransport({
        host,
        port: this.config.get('PLATFORM_SMTP_PORT'),
        auth: this.config.get('PLATFORM_SMTP_USER')
          ? { user: this.config.get('PLATFORM_SMTP_USER'), pass: this.config.get('PLATFORM_SMTP_PASS') }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(to: string | null | undefined, subject: string, body: string): Promise<void> {
    if (!to) {
      this.logger.warn(`Skipped "${subject}" — no recipient resolved (see caller's own audience-resolution doc comment)`);
      return;
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.log(`[notification, SMTP not configured — logged only] to=${to} subject="${subject}"\n${body}`);
      return;
    }

    try {
      await transporter.sendMail({ from: this.config.get('PLATFORM_SMTP_FROM'), to, subject, text: body });
    } catch (error) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, error);
    }
  }
}
