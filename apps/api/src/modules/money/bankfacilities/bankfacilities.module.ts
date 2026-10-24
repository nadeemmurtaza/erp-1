import { Module } from '@nestjs/common';
import { BankFacilitiesController } from './bankfacilities.controller';
import { BankFacilitiesService } from './bankfacilities.service';
import { BankFacilitiesCron } from './bankfacilities.cron';

/**
 * Bank facility management (finance-accounting/167-bank-facility-
 * management.md). Off by default (modules.registry.ts) — a Solo shop with
 * no bank borrowing must not see this concept at all. Imports no other
 * module: `BankFacilitiesService` reaches accounting's posting only by
 * publishing `BankFacilityDrawdownPosted`/`BankFacilityRepaymentRecorded`/
 * `BankFacilityMarkupAccrued`, which `posting-rules.subscriber.ts`
 * subscribes to — the identical decoupling `settlements` already
 * establishes.
 */
@Module({
  controllers: [BankFacilitiesController],
  providers: [BankFacilitiesService, BankFacilitiesCron],
  exports: [BankFacilitiesService],
})
export class BankFacilitiesModule {}
