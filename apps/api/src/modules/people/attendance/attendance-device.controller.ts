import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission, SessionOnly } from '../../../core/auth/decorators';
import { AttendanceDeviceService } from './attendance-device.service';
import { RegisterAttendanceDeviceDto, UpdateAttendanceDeviceDto } from './dto/attendance-device.dto';

/**
 * attendance-workforce/22-attendance-shifts-leave.md WO-22.4 — device
 * enrolment, admin-only. The actual inbound punch endpoint a device calls
 * is `@Public()` and lives on `AttendanceController`, verified by device
 * key rather than a permission — see that controller's own header.
 */
@ApiTags('admin/attendance/devices')
@Controller('admin/attendance/devices')
@RequirePermission('hr.attendance.record')
export class AttendanceDeviceController {
  constructor(private readonly devices: AttendanceDeviceService) {}

  @Get()
  @ApiOperation({ summary: 'List enrolled attendance devices' })
  async findAll() {
    return { data: await this.devices.findAll() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a device' })
  async findOne(@Param('id') id: string) {
    return this.devices.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Enrol a device at an org unit' })
  async register(@Body() dto: RegisterAttendanceDeviceDto) {
    return this.devices.register(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a device' })
  async update(@Param('id') id: string, @Body() dto: UpdateAttendanceDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Suspend a device — never deletes it, its punch history stays put' })
  async suspend(@Param('id') id: string) {
    return this.devices.suspend(id);
  }

  // Mints a credential that would outlive any API key (163-personal-api-keys.md §2).
  @Post(':id/rotate-device-key')
  @SessionOnly()
  @ApiOperation({ summary: 'Issue a fresh device credential — shown once, never retrievable again' })
  async rotateDeviceKey(@Param('id') id: string) {
    return this.devices.rotateDeviceKey(id);
  }
}
