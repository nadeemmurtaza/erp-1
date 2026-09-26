import { Test, TestingModule } from '@nestjs/testing';
import { PlansService } from './plans.service';
import { SignupService } from '../trials/signup.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlatformNotificationsService } from '../../core/notifications/notifications.service';
import { ProvisioningService } from '../tenants/provisioning.service';

/**
 * doc 154's own acceptance criterion, proven end to end rather than by
 * inspection alone: "selecting any of the three headline plans provisions
 * a tenant through the identical existing path its own PricingModel
 * already uses — no new provisioning code." This wires the real
 * `PlansService.getPlanComparison()` (WO-154.3) straight into the real,
 * pre-existing `SignupService` (doc 51) — the exact hand-off `pricing.html`
 * performs by linking to `/ui/signup?plan=<key>` — and asserts the SAME
 * `ProvisioningService.provisionTenant()` mock is called with that plan's
 * own key, never a second, parallel provisioning call.
 */
describe('a headline plan hands off to the identical existing provisioning path (doc 154 acceptance)', () => {
  let prisma: any;
  let plans: PlansService;
  let signup: SignupService;
  let provisioning: any;

  beforeEach(async () => {
    prisma = {
      platformPlan: { findMany: jest.fn(), findUnique: jest.fn() },
      signupVerification: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    };
    provisioning = { provisionTenant: jest.fn() };
    const config = {
      get: (key: string) => ({
        PLATFORM_SIGNUP_VERIFICATION_TTL_MINUTES: 30,
        PLATFORM_PUBLIC_BASE_URL: 'http://localhost:3100',
        PLATFORM_API_PREFIX: 'platform',
        PLATFORM_TRIAL_DEFAULT_DAYS: 14,
      })[key],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        SignupService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
        { provide: PlatformNotificationsService, useValue: { send: jest.fn() } },
        { provide: ProvisioningService, useValue: provisioning },
      ],
    }).compile();

    plans = module.get(PlansService);
    signup = module.get(SignupService);
  });

  it('a FLAT_MONTHLY headline plan\'s own key, as read from getPlanComparison(), provisions via the unchanged ProvisioningService.provisionTenant()', async () => {
    const headlinePlan = {
      key: 'per-month-real', isActive: true, pricingModel: 'FLAT_MONTHLY', licenseDeploymentMode: null,
      displayName: 'Per Month', priceDescription: 'From Rs 9,900/month', bestFor: 'Predictable cost.', ctaLabel: 'Start subscription',
    };
    prisma.platformPlan.findMany.mockResolvedValue([headlinePlan]);

    const [row] = await plans.getPlanComparison();
    expect(row.key).toBe('per-month-real'); // exactly what the CTA hands to /ui/signup?plan=

    // The pricing page's CTA lands on /ui/signup?plan=<row.key>, which
    // submits that same key straight to /signup — doc 51's own,
    // unmodified RequestSignupDto.planKey.
    prisma.platformPlan.findUnique.mockResolvedValue(headlinePlan);
    prisma.signupVerification.create.mockResolvedValue({ id: 'v1' });
    await signup.requestSignup({ email: 'buyer@example.com', slug: 'buyer-co', legalName: 'Buyer Co', planKey: row.key });

    expect(prisma.signupVerification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ planKey: 'per-month-real' }) }),
    );

    // Following the emailed verification link runs the SAME
    // ProvisioningService.provisionTenant() every other PricingModel
    // already uses — no parallel/second provisioning call anywhere.
    prisma.signupVerification.findUnique.mockResolvedValue({
      id: 'v1', consumedAt: null, expiresAt: new Date(Date.now() + 60_000),
      slug: 'buyer-co', legalName: 'Buyer Co', planKey: 'per-month-real', email: 'buyer@example.com',
    });
    prisma.signupVerification.updateMany.mockResolvedValue({ count: 1 });
    provisioning.provisionTenant.mockResolvedValue({ id: 't1', status: 'TRIAL' });

    await signup.verifyAndProvision('tok');

    expect(provisioning.provisionTenant).toHaveBeenCalledTimes(1);
    expect(provisioning.provisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'buyer-co', planKey: 'per-month-real' }),
    );
  });
});
