import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { ExpenseImportService } from './expense-import.service';
import { FinanceCron } from './finance.cron';
import { FinanceListener } from './finance.listener';
import { OrderEconomicsService } from './order-economics.service';
import { ExpenseReplicationListener } from './expense-replication.listener';
import { RtoExpenseListener } from './rto-expense.listener';
import { FinanceMetricsProvider } from './finance.metrics';

@Module({
  controllers: [FinanceController],
  providers: [
    FinanceService,
    ExpenseImportService,
    FinanceCron,
    FinanceListener,
    OrderEconomicsService,
    ExpenseReplicationListener,
    RtoExpenseListener,
    FinanceMetricsProvider,
  ],
})
export class FinanceModule {}
