import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import { DomainEvent } from '../../../core/events/domain-events';
import { EventBusService } from '../../../core/events/event-bus.service';
import { IdentityVerificationStatusRegistry } from '../../../core/extension-points/identity-verification-status.registry';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NidVerificationProvider } from './providers/nid.provider';

@Injectable()
export class IdentityVerificationService implements OnModuleInit {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly audit: AuditService,
    private readonly provider: NidVerificationProvider,
    private readonly statusRegistry: IdentityVerificationStatusRegistry,
  ) {}

  /**
   * Registers this module's own answer to "is this user verified?" — see
   * IdentityVerificationStatusRegistry's own doc. Runs only when this
   * module is enabled in MODULES; `doc 155`'s WalletModule (also off by
   * default) reads through the registry rather than importing this module
   * directly, so both can be switched on independently.
   */
  onModuleInit(): void {
    this.statusRegistry.register({
      isApproved: async (userId: string) => {
        const record = await this.prisma.identityVerification.findUnique({
          where: { userId },
          select: { status: true },
        });
        return record?.status === 'APPROVED';
      },
    });
  }

  /** Starts a new verification, or restarts one after REJECTED/EXPIRED. */
  async start(userId: string): Promise<{ status: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const existing = await this.prisma.identityVerification.findUnique({ where: { userId } });

    if (existing?.status === 'PENDING') {
      throw new BadRequestException('A verification is already in progress for this account.');
    }
    if (existing?.status === 'APPROVED') {
      throw new BadRequestException('This account is already verified.');
    }

    const result = await this.provider.start({
      userId: user.id,
      givenName: user.firstName,
      familyName: user.lastName,
      email: user.email,
      phone: user.phone,
      // Reuse the nID Subject from a prior attempt rather than creating a
      // second one — see identity-verification.prisma's comment on
      // nidSubjectId and NidVerificationProvider.start().
      existingProviderSubjectId: existing?.nidSubjectId ?? null,
    });

    const record = await this.prisma.identityVerification.upsert({
      where: { userId },
      create: {
        userId,
        nidSubjectId: result.providerSubjectId,
        nidCaseId: result.providerCaseId,
        status: 'PENDING',
        startedAt: new Date(),
      },
      update: {
        nidSubjectId: result.providerSubjectId,
        nidCaseId: result.providerCaseId,
        status: 'PENDING',
        method: null,
        failureReason: null,
        startedAt: new Date(),
        resolvedAt: null,
      },
    });

    await this.audit.record({
      actorId: userId,
      action: 'identity_verification.started',
      entity: 'IdentityVerification',
      entityId: record.id,
    });

    return { status: record.status };
  }

  /** Forwards the code the subject received from nID's otp_sms method. */
  async submitOtp(userId: string, code: string): Promise<{ accepted: true }> {
    const record = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (!record?.nidCaseId || record.status !== 'PENDING') {
      throw new BadRequestException('No verification is currently in progress for this account.');
    }

    await this.provider.submitOtp(record.nidCaseId, code);
    return { accepted: true };
  }

  async status(userId: string): Promise<{ status: string; method: string | null; resolvedAt: Date | null }> {
    const record = await this.prisma.identityVerification.findUnique({ where: { userId } });
    return {
      status: record?.status ?? 'NOT_STARTED',
      method: record?.method ?? null,
      resolvedAt: record?.resolvedAt ?? null,
    };
  }

  /**
   * Resolves a case from nID's signed webhook. `rawBody`/`headers` are
   * passed straight through to the provider, which is the only thing that
   * knows how to verify them — see NidVerificationProvider.handleCallback
   * and identity-verification-provider.ts's note on why this takes a raw
   * body rather than a parsed object.
   */
  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const result = await this.provider.handleCallback(rawBody, headers);

    // A callback that could not be proved to come from nID changes nothing
    // — same rule PaymentsService.handleCallback applies to gateway callbacks.
    if (result.verified === false) {
      throw new ForbiddenException('That identity-verification callback could not be verified.');
    }

    const record = await this.prisma.identityVerification.findFirst({
      where: { nidCaseId: result.providerCaseId },
    });
    if (!record) {
      this.logger.warn(`nID webhook for unknown case ${result.providerCaseId}`);
      return;
    }

    // Callbacks are at-least-once on nID's side; the first one wins.
    if (record.status !== 'PENDING') return;

    const method = typeof result.raw['method'] === 'string' ? (result.raw['method'] as string) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.identityVerification.update({
        where: { id: record.id },
        data: {
          status: result.status,
          method,
          resolvedAt: new Date(),
          failureReason:
            result.status === 'APPROVED' ? null : JSON.stringify(result.raw).slice(0, 500),
        },
      });

      const event = {
        APPROVED: DomainEvent.IdentityVerificationApproved,
        REJECTED: DomainEvent.IdentityVerificationRejected,
        EXPIRED: DomainEvent.IdentityVerificationExpired,
      }[result.status];

      await this.events.publish(event, { userId: record.userId, method }, tx);
    });

    this.logger.log(`Identity verification ${result.status.toLowerCase()} for user ${record.userId}`);
  }
}
