import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { CustomQuoteController } from './custom-quote.controller';
import { PlansController } from './plans.controller';
import { BillingService } from './billing.service';
import { CustomQuoteService } from './custom-quote.service';
import { PlansService } from './plans.service';
import { SeatCounterService } from './seat-counter.service';
import { BillingCron } from './billing.cron';

@Module({
  controllers: [BillingController, CustomQuoteController, PlansController],
  providers: [BillingService, CustomQuoteService, PlansService, SeatCounterService, BillingCron],
  exports: [BillingService, CustomQuoteService, PlansService, SeatCounterService],
})
export class BillingModule {}
