import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SignupService } from './signup.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { ProvisioningService } from '../tenants/provisioning.service';

describe('SignupService', () => {
  let prisma: any;
  let notifications: any;
  let provisioning: any;
  let service: SignupService;

  const dto = { email: 'prospect@example.com', slug: 'acme', legalName: 'Acme', planKey: 'solo-shared' };

  beforeEach(async () => {
    prisma = {
      platformPlan: { findUnique: jest.fn() },
      signupVerification: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    notifications = { send: jest.fn() };
    provisioning = { provisionTenant: jest.fn() };
    const config = {
      get: (key: string) => {
        const values: Record<string, unknown> = {
          PLATFORM_SIGNUP_VERIFICATION_TTL_MINUTES: 30,
          PLATFORM_PUBLIC_BASE_URL: 'http://localhost:3100',
          PLATFORM_API_PREFIX: 'platform',
          PLATFORM_TRIAL_DEFAULT_DAYS: 14,
        };
        return values[key];
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignupService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
        { provide: PlatformNotificationsService, useValue: notifications },
        { provide: ProvisioningService, useValue: provisioning },
      ],
    }).compile();

    service = module.get(SignupService);
  });

  describe('requestSignup', () => {
    it('rejects an unknown or inactive plan', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue(null);
      await expect(service.requestSignup(dto)).rejects.toThrow(NotFoundException);
      expect(prisma.signupVerification.create).not.toHaveBeenCalled();
    });

    it('creates a pending verification and emails a link — never provisions directly', async () => {
      prisma.platformPlan.findUnique.mockResolvedValue({ key: 'solo-shared', isActive: true });
      prisma.signupVerification.create.mockResolvedValue({ id: 'v1' });

      await service.requestSignup(dto, '203.0.113.1');

      expect(prisma.signupVerification.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: dto.email, slug: dto.slug, ipAddress: '203.0.113.1' }) }),
      );
      expect(notifications.send).toHaveBeenCalledWith(dto.email, expect.any(String), expect.stringContaining('http://localhost:3100'));
      expect(provisioning.provisionTenant).not.toHaveBeenCalled();
    });
  });

  describe('verifyAndProvision', () => {
    it('rejects an unknown token', async () => {
      prisma.signupVerification.findUnique.mockResolvedValue(null);
      await expect(service.verifyAndProvision('bogus')).rejects.toThrow(NotFoundException);
    });

    it('rejects an expired, unconsumed token', async () => {
      prisma.signupVerification.findUnique.mockResolvedValue({
        id: 'v1', consumedAt: null, expiresAt: new Date(Date.now() - 1000), slug: 'acme', legalName: 'Acme', planKey: 'solo-shared', email: dto.email,
      });
      await expect(service.verifyAndProvision('tok')).rejects.toThrow(BadRequestException);
      expect(provisioning.provisionTenant).not.toHaveBeenCalled();
    });

    it('provisions a TRIAL tenant with the configured default trial length', async () => {
      prisma.signupVerification.findUnique.mockResolvedValue({
        id: 'v1', consumedAt: null, expiresAt: new Date(Date.now() + 60_000), slug: 'acme', legalName: 'Acme', planKey: 'solo-shared', email: dto.email,
      });
      prisma.signupVerification.updateMany.mockResolvedValue({ count: 1 });
      provisioning.provisionTenant.mockResolvedValue({ id: 't1', status: 'TRIAL' });

      const result = await service.verifyAndProvision('tok');

      expect(prisma.signupVerification.updateMany).toHaveBeenCalledWith({
        where: { id: 'v1', consumedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
      expect(provisioning.provisionTenant).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'acme', billingContactEmail: dto.email, trialDays: 14 }),
      );
      expect(result.status).toBe('TRIAL');
    });

    it('still provisions correctly on a race where a concurrent click already consumed the token (idempotent via slug)', async () => {
      prisma.signupVerification.findUnique.mockResolvedValue({
        id: 'v1', consumedAt: null, expiresAt: new Date(Date.now() + 60_000), slug: 'acme', legalName: 'Acme', planKey: 'solo-shared', email: dto.email,
      });
      prisma.signupVerification.updateMany.mockResolvedValue({ count: 0 }); // someone else claimed it first
      provisioning.provisionTenant.mockResolvedValue({ id: 't1', status: 'TRIAL' });

      const result = await service.verifyAndProvision('tok');

      expect(result.status).toBe('TRIAL'); // provisionTenant's own slug-idempotency still returns the right tenant
    });

    it('turns a provisioning failure into a human-readable retry message, never a stack trace', async () => {
      prisma.signupVerification.findUnique.mockResolvedValue({
        id: 'v1', consumedAt: null, expiresAt: new Date(Date.now() + 60_000), slug: 'acme', legalName: 'Acme', planKey: 'solo-shared', email: dto.email,
      });
      prisma.signupVerification.updateMany.mockResolvedValue({ count: 1 });
      provisioning.provisionTenant.mockRejectedValue(new Error('database cluster unreachable: internal stack trace details'));

      await expect(service.verifyAndProvision('tok')).rejects.toThrow('We could not create your trial right now — please try again in a few minutes.');
    });
  });
});
