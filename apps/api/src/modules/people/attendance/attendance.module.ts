import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceDeviceController } from './attendance-device.controller';
import { AttendanceDeviceService } from './attendance-device.service';
import { AttendanceDevicePunchController } from './attendance-device-punch.controller';
import { AttendancePartitionCron } from './attendance-partition.cron';

/**
 * attendance-workforce/22-attendance-shifts-leave.md — a genuinely distinct
 * capability from `hr` (assets/positions/postings/ranks), not folded into
 * it, the same reasoning `orgstructure` was split out from `organization`
 * for docs 19/20. Reads `hr`'s `Posting`/`Rank`/`Position` tables and
 * `payroll`'s `LeaveRequest` table directly by Prisma query — never a TS
 * import of either module's own services — see `AttendanceService`'s and
 * `GrantService`'s own header comments for why that is the correct pattern
 * here, not a same-transaction `KNOWN_MODULE_COUPLINGS` case.
 */
@Module({
  controllers: [AttendanceController, AttendanceDeviceController, AttendanceDevicePunchController],
  providers: [AttendanceService, AttendanceDeviceService, AttendancePartitionCron],
  exports: [AttendanceService, AttendanceDeviceService],
})
export class AttendanceModule {}
