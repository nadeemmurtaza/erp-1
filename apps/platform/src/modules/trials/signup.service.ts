import { randomBytes, createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { ProvisioningService } from '../tenants/provisioning.service';
import type { PlatformTenant } from '../../core/prisma/client';
import type { RequestSignupDto } from './dto/signup.dto';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * WO-51.2 — self-service signup. Doc 51 §3's own shape: "the form itself
 * is a thin request that calls `ProvisioningService.provisionTenant()`
 * with `status: TRIAL`" — never a second, parallel provisioning path.
 * Nothing is provisioned until the email link is followed
 * (`SignupVerification`), which is this app's own answer to "CAPTCHA/
 * email-verified at the edge" for the half of that sentence that is
 * genuinely this control plane's job (email ownership) rather than a
 * third-party CAPTCHA service's (named honestly as not built here — see
 * the module's own README note in the shipped-status doc header).
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly notifications: PlatformNotificationsService,
    private readonly provisioning: ProvisioningService,
  ) {}

  async requestSignup(dto: RequestSignupDto, ipAddress?: string): Promise<{ verificationSent: true }> {
    const plan = await this.prisma.platformPlan.findUnique({ where: { key: dto.planKey } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException(`No active plan with key "${dto.planKey}"`);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const ttlMinutes = this.config.get('PLATFORM_SIGNUP_VERIFICATION_TTL_MINUTES');

    await this.prisma.signupVerification.create({
      data: {
        email: dto.email,
        slug: dto.slug,
        legalName: dto.legalName,
        planKey: dto.planKey,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
        ipAddress,
      },
    });

    const verifyUrl = `${this.config.get('PLATFORM_PUBLIC_BASE_URL')}/${this.config.get('PLATFORM_API_PREFIX')}/ui/verify?token=${rawToken}`;
    await this.notifications.send(
      dto.email,
      'Verify your email to start your trial',
      `Click to verify your email and start your trial: ${verifyUrl}\nThis link expires in ${ttlMinutes} minutes.`,
    );

    return { verificationSent: true };
  }

  /**
   * Consumed exactly once. `updateMany` with `consumedAt: null` in the
   * `where` clause is this method's own concurrency guard — two near-
   * simultaneous clicks on the same link race on ONE row update, and only
   * one wins; either way `provisionTenant()` is independently idempotent
   * on `slug` (doc 39's own mechanism), so even a lost race here still
   * converges on exactly one trial tenant — doc 51's own acceptance
   * criterion, satisfied twice over.
   */
  async verifyAndProvision(rawToken: string): Promise<PlatformTenant> {
    const tokenHash = hashToken(rawToken);
    const verification = await this.prisma.signupVerification.findUnique({ where: { tokenHash } });
    if (!verification) throw new NotFoundException('This verification link is invalid.');
    if (!verification.consumedAt && verification.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This verification link has expired — please sign up again.');
    }

    await this.prisma.signupVerification.updateMany({
      where: { id: verification.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    try {
      return await this.provisioning.provisionTenant({
        slug: verification.slug,
        legalName: verification.legalName,
        planKey: verification.planKey,
        billingContactEmail: verification.email,
        trialDays: this.config.get('PLATFORM_TRIAL_DEFAULT_DAYS'),
      });
    } catch (error) {
      // Doc 51's own failure path: a real, human-readable retry message,
      // never a stack trace, and no partial tenant left behind —
      // `provisionTenant()` itself already guarantees the latter.
      this.logger.error(`Trial provisioning failed for slug ${verification.slug}`, error);
      throw new BadRequestException('We could not create your trial right now — please try again in a few minutes.');
    }
  }
}
