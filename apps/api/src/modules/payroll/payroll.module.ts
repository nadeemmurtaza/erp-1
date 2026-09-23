import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

/**
 * Compensation, leave and pay runs (docs/implementation/19-payroll.md).
 * PayrollService/PayrollController (WO-19.2) are compensation rates and
 * the salary calculator; leave (WO-19.3) and pay runs (WO-19.4) add their
 * own providers on top.
 */
@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
