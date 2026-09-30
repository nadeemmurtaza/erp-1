import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../core/auth/decorators';
import { bearerToken } from '../../../core/auth/bearer-token';
import { AttendanceDeviceService } from './attendance-device.service';
import { AttendanceService } from './attendance.service';
import { ManagerPunchDto } from './dto/attendance.dto';

/**
 * What an enrolled `AttendanceDevice` calls — authenticated by its device
 * key, never a user session, so this route is `@Public()` and verifies the
 * key itself. The identical shape `TradingPartnerPortalController` already
 * establishes for a non-User caller: distinct from
 * `AttendanceDeviceController` (`admin/attendance/devices`), which is staff
 * enrolling and managing devices, not a device calling in.
 *
 * "A punch is never refused" — this route has no `@RequirePermission` at
 * all; a device with a valid, ACTIVE key writes unconditionally. Anything
 * that does not fit becomes an `AttendanceException`, never a rejected call.
 */
@ApiTags('Attendance Device')
@Controller('attendance')
export class AttendanceDevicePunchController {
  constructor(
    private readonly devices: AttendanceDeviceService,
    private readonly attendance: AttendanceService,
  ) {}

  @Post('punch')
  @Public()
  @ApiOperation({ summary: 'Record a punch from an enrolled device — never refused' })
  async punch(@Headers('authorization') authorization: string | undefined, @Body() dto: ManagerPunchDto) {
    const device = await this.devices.verifyDeviceKey(bearerToken(authorization));

    return this.attendance.record(
      {
        userId: dto.userId,
        kind: dto.kind,
        occurredAt: new Date(dto.occurredAt),
        timezone: dto.timezone,
        orgUnitId: dto.orgUnitId,
        source: 'DEVICE',
        deviceId: device.id,
        externalRef: dto.externalRef,
      },
      null,
    );
  }
}
