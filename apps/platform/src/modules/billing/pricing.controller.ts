import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from '../../core/config/app-config.service';
import { PlansService } from './plans.service';

/**
 * WO-154.3 — the public pricing-comparison endpoint `pricing.html` reads.
 * Unauthenticated by design, same as `SignupController` (doc 51 §"the
 * principal with no permission key": nobody has an account yet, and this
 * is a pure read with no side effect at all — the global `ThrottlerGuard`
 * (`AppModule`) is the only bound on it, no `OpsAuthGuard`, since it never
 * exposes a `PlatformPlan`'s own internal billing fields — see
 * `PlansService.getPlanComparison()`'s own doc comment for exactly what it
 * withholds.
 */
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly plans: PlansService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  async compare() {
    return {
      plans: await this.plans.getPlanComparison(),
      // doc 154 §4 — the "need something else?" contact for PER_SEAT and
      // any other non-headline plan, resolved through config rather than
      // hardcoded in `pricing.html`.
      contactEmail: this.config.get('PLATFORM_SALES_CONTACT_EMAIL'),
    };
  }
}
