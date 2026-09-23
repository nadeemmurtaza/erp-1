import { Module } from '@nestjs/common';

/**
 * Compensation, leave and pay runs (docs/implementation/19-payroll.md).
 * Empty until WO-19.2 adds PayrollService/PayrollController — registered
 * now so the module-absence boot check and MODULES allowlist wiring can
 * be verified before the first real provider lands on top of it.
 */
@Module({})
export class PayrollModule {}
