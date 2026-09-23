import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceCron } from './finance.cron';
import { FinanceListener } from './finance.listener';
import { OrderEconomicsService } from './order-economics.service';
import { ExpenseReplicationListener } from './expense-replication.listener';

@Module({
  controllers: [FinanceController],
  providers: [FinanceService, FinanceCron, FinanceListener, OrderEconomicsService, ExpenseReplicationListener],
})
export class FinanceModule {}
