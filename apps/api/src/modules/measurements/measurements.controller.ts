import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, Public, RequirePermission } from '../../core/auth/decorators';
import {
  CreateMeasurementProfileDto,
  GarmentSizeChartRowDto,
  UpdateMeasurementProfileDto,
  UpsertGarmentTypeDto,
} from './dto/measurements.dto';
import { MeasurementsAdminService } from './measurements-admin.service';
import { MeasurementsService } from './measurements.service';

@ApiTags('measurements')
@Controller('measurements')
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  @Public()
  @Get('garment-types')
  @ApiOperation({ summary: 'Garment types with their measurement fields' })
  listGarmentTypes() {
    return this.measurements.listGarmentTypes();
  }

  @Public()
  @Get('garment-types/:idOrKey')
  @ApiOperation({ summary: 'One garment type and its fields' })
  getGarmentType(@Param('idOrKey') idOrKey: string) {
    return this.measurements.getGarmentType(idOrKey);
  }

  @AuthenticatedOnly()
  @Get('profiles')
  @ApiOperation({ summary: "The signed-in customer's saved measurement profiles" })
  listProfiles(@CurrentUser() user: AuthenticatedUser) {
    return this.measurements.listProfiles(user.id);
  }

  @AuthenticatedOnly()
  @Get('profiles/:id')
  getProfile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.measurements.getProfile(user.id, id);
  }

  @AuthenticatedOnly()
  @Post('profiles')
  @ApiOperation({ summary: 'Save a measurement profile' })
  createProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeasurementProfileDto,
  ) {
    return this.measurements.createProfile(user.id, dto);
  }

  @AuthenticatedOnly()
  @Patch('profiles/:id')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMeasurementProfileDto,
  ) {
    return this.measurements.updateProfile(user.id, id, dto);
  }

  @AuthenticatedOnly()
  @Delete('profiles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProfile(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.measurements.deleteProfile(user.id, id);
  }
}

@ApiTags('admin/measurements')
@Controller('admin/measurements')
@RequirePermission('measurements.manage_blueprints')
export class MeasurementsAdminController {
  constructor(
    private readonly measurements: MeasurementsService,
    private readonly admin: MeasurementsAdminService,
  ) {}

  @Get('garment-types')
  @ApiOperation({ summary: 'All garment types, including deactivated ones' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.measurements.listGarmentTypes(includeInactive !== 'false');
  }

  @Post('garment-types')
  @ApiOperation({ summary: 'Add a garment type and its measurement fields' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertGarmentTypeDto) {
    return this.admin.createGarmentType(user.id, dto);
  }

  @Patch('garment-types/:id')
  @ApiOperation({ summary: 'Edit a garment type; removed fields are deactivated' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertGarmentTypeDto,
  ) {
    return this.admin.updateGarmentType(user.id, id, dto);
  }

  @Delete('garment-types/:id')
  @ApiOperation({ summary: 'Deactivate a garment type (never hard-deleted)' })
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.admin.deactivateGarmentType(user.id, id);
  }

  @Put('garment-types/:id/size-chart')
  @ApiOperation({
    summary: 'Replace RTW size rows (XS-XXL) for a garment; omitted sizes are left alone',
  })
  replaceSizeChart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ParseArrayPipe({ items: GarmentSizeChartRowDto, whitelist: true, forbidNonWhitelisted: true }))
    rows: GarmentSizeChartRowDto[],
  ) {
    return this.admin.replaceSizeChart(user.id, id, rows);
  }
}
