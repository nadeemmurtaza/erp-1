import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceCron } from './finance.cron';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceCron],
})
export class FinanceModule {}
