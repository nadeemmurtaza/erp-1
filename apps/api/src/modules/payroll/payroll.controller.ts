import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { GrossPreviewQueryDto, SetCompensationRateDto } from './dto/compensation-rate.dto';
import { PayrollService } from './payroll.service';

/**
 * Compensation rates and the salary calculator (docs/implementation/
 * 19-payroll.md WO-19.2). "Own record" routes take no :userId — they act on
 * @CurrentUser() only, the same shape AuthController.changePassword already
 * uses for account.change_own_password.
 */
@ApiTags('admin/payroll')
@Controller('admin/payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('compensation')
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: "Every employee's current compensation rate." })
  async listCompensation() {
    return this.payroll.listCurrentRates();
  }

  @Get('compensation/me')
  @RequirePermission('payroll.view_own')
  @ApiOperation({ summary: "The caller's own current rate and rate history." })
  async myCompensation(@CurrentUser() user: AuthenticatedUser) {
    const [current, history] = await Promise.all([
      this.payroll.currentRate(user.id),
      this.payroll.rateHistory(user.id),
    ]);
    return { current, history };
  }

  @Get('compensation/:userId')
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: "One employee's current rate and rate history." })
  async compensation(@Param('userId') userId: string) {
    await this.payroll.requireUser(userId);
    const [current, history] = await Promise.all([
      this.payroll.currentRate(userId),
      this.payroll.rateHistory(userId),
    ]);
    return { current, history };
  }

  @Patch('compensation/:userId')
  @RequirePermission('payroll.manage')
  @ApiOperation({ summary: 'Set a new effective-dated compensation rate, closing the previous one.' })
  async setCompensation(
    @Param('userId') userId: string,
    @Body() dto: SetCompensationRateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.payroll.requireUser(userId);
    return this.payroll.setCompensationRate(
      userId,
      dto.basis,
      dto.amountMinor,
      new Date(dto.effectiveFrom),
      user.id,
    );
  }

  @Get('compensation/:userId/preview')
  @RequirePermission('payroll.view')
  @ApiOperation({ summary: 'Preview the gross salary calculation for a period, no write.' })
  async previewGross(@Param('userId') userId: string, @Query() query: GrossPreviewQueryDto) {
    await this.payroll.requireUser(userId);
    return this.payroll.calculateGross(userId, new Date(query.periodStart), new Date(query.periodEnd), {
      hoursWorked: query.hoursWorked,
      commissionMinor: query.commissionMinor,
    });
  }
}
