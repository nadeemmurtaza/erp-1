import { Module } from '@nestjs/common';
import { LeaveAccrualCron } from './leave-accrual.cron';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Compensation, leave and pay runs (docs/implementation/19-payroll.md).
 * PayrollService/PayrollController (WO-19.2) are compensation rates and
 * the salary calculator; LeaveService/LeaveController/LeaveAccrualCron
 * (WO-19.3) are leave policy, balances and requests; pay runs (WO-19.4)
 * add their own providers on top.
 */
@Module({
  controllers: [PayrollController, LeaveController],
  providers: [PayrollService, LeaveService, LeaveAccrualCron],
  exports: [PayrollService, LeaveService],
})
export class PayrollModule {}
