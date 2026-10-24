import { Module } from '@nestjs/common';
import { LeaveAccrualCron } from './leave-accrual.cron';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveRequestActionSource } from './leave-request-action.source';
import { PayRunController } from './pay-run.controller';
import { PayRunService } from './pay-run.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Compensation, leave and pay runs (docs/implementation/payroll/19-payroll.md).
 * PayrollService/PayrollController (WO-19.2) are compensation rates and
 * the salary calculator; LeaveService/LeaveController/LeaveAccrualCron
 * (WO-19.3) are leave policy, balances and requests; PayRunService/
 * PayRunController (WO-19.4) build on both to produce a postable pay run.
 */
@Module({
  controllers: [PayrollController, LeaveController, PayRunController],
  providers: [PayrollService, LeaveService, LeaveAccrualCron, PayRunService, LeaveRequestActionSource],
  exports: [PayrollService, LeaveService, PayRunService],
})
export class PayrollModule {}
