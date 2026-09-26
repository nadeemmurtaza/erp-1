import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { CustomQuoteController } from './custom-quote.controller';
import { PlansController } from './plans.controller';
import { PricingController } from './pricing.controller';
import { RateCardController } from './rate-card.controller';
import { BillingService } from './billing.service';
import { CustomQuoteService } from './custom-quote.service';
import { PlansService } from './plans.service';
import { RateCardService } from './rate-card.service';
import { SeatCounterService } from './seat-counter.service';
import { UsageMeteringService } from './usage-metering.service';
import { BillingCron } from './billing.cron';
import { UsageMeteringCron } from './usage-metering.cron';
import { InvoiceDunningCron } from './invoice-dunning.cron';

@Module({
  controllers: [BillingController, CustomQuoteController, PlansController, PricingController, RateCardController],
  providers: [
    BillingService,
    CustomQuoteService,
    PlansService,
    RateCardService,
    SeatCounterService,
    UsageMeteringService,
    BillingCron,
    UsageMeteringCron,
    InvoiceDunningCron,
  ],
  exports: [BillingService, CustomQuoteService, PlansService, RateCardService, SeatCounterService, UsageMeteringService],
})
export class BillingModule {}
