import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import { CurrentUser, Public, Roles } from '../../core/auth/decorators';
import type { StitchingOrderStatus, StitchingStage } from '../../core/prisma/client';
import { StitchingDesignOptionsService } from './design-options.service';
import {
  AssignJobDto,
  BookStitchingDto,
  ChangeStageDto,
  ChangeStitchingOrderStatusDto,
  CreateStitchingOptionDto,
  CreateStitchingOptionGroupDto,
  FabricReceivedDto,
  QuoteStitchingDto,
  TrackStitchingDto,
  UpdateStitchingOptionDto,
  UpdateStitchingOptionGroupDto,
} from './dto/stitching.dto';
import { StitchingJobsService } from './jobs.service';
import { StitchingOrdersService } from './stitching-orders.service';
import { StitchingService } from './stitching.service';

interface UploadedPhoto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@ApiTags('stitching')
@Controller('stitching')
export class StitchingController {
  constructor(
    private readonly stitching: StitchingService,
    private readonly orders: StitchingOrdersService,
  ) {}

  @Public()
  @Get('garments')
  @ApiOperation({
    summary: 'Garments we stitch, with the fee, measurements and style options',
  })
  garments() {
    return this.stitching.listGarments();
  }

  @Public()
  @Get('option-groups')
  @ApiOperation({ summary: 'Style options for a garment, with their price deltas' })
  optionGroups(@Query('garmentType') garmentType?: string) {
    return this.stitching.listOptionGroups(garmentType);
  }

  @Public()
  @Post('bookings')
  @ApiOperation({ summary: 'Book stitching for fabric the customer supplies' })
  book(@CurrentUser() user: AuthenticatedUser | undefined, @Body() dto: BookStitchingDto) {
    return this.orders.book(user?.id, dto);
  }

  @Public()
  @Post('bookings/:number/track')
  @ApiOperation({ summary: 'Track a booking with the phone number it was made with' })
  track(@Param('number') number: string, @Body() dto: TrackStitchingDto) {
    return this.orders.findByNumber(number, dto.phone);
  }
}

@ApiTags('admin/stitching')
@Controller('admin/stitching')
@Roles('ADMIN', 'STAFF', 'TAILOR')
export class StitchingAdminController {
  constructor(
    private readonly jobs: StitchingJobsService,
    private readonly orders: StitchingOrdersService,
    private readonly design: StitchingDesignOptionsService,
  ) {}

  // --- The tailor queue ----------------------------------------------------

  @Get('jobs')
  @ApiOperation({ summary: 'The tailor queue, oldest due first' })
  listJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage?: StitchingStage,
    @Query('tailorId') tailorId?: string,
    @Query('mine') mine?: string,
    @Query('overdue') overdue?: string,
  ) {
    return this.jobs.list({
      stage,
      // A tailor's own queue is the common case, so it has a shorthand.
      tailorId: mine === 'true' ? user.id : tailorId,
      overdue: overdue === 'true',
    });
  }

  @Get('jobs/workload')
  @ApiOperation({ summary: 'Jobs by stage, and each tailor’s open load' })
  workload() {
    return this.jobs.workload();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.get(id);
  }

  @Post('jobs/:id/assign')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Give a job to a tailor, or take it back' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignJobDto,
  ) {
    return this.jobs.assign(user.id, id, dto.tailorId ?? null);
  }

  @Post('jobs/:id/stage')
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        stage: { type: 'string' },
        note: { type: 'string' },
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('photo'))
  @ApiOperation({
    summary: 'Move a job one stage, optionally with a note and a photograph',
  })
  changeStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeStageDto,
    @UploadedFile() photo?: UploadedPhoto,
  ) {
    if (!dto.stage) {
      throw new BadRequestException('Say which stage the job is moving to.');
    }
    return this.jobs.changeStage(user, id, dto.stage, dto.note, photo);
  }

  // --- Bookings for the customer's own fabric -------------------------------

  @Get('bookings')
  @Roles('ADMIN', 'STAFF')
  listBookings(@Query('status') status?: StitchingOrderStatus) {
    return this.orders.list(status);
  }

  @Get('bookings/:id')
  @Roles('ADMIN', 'STAFF')
  getBooking(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Post('bookings/:id/fabric-received')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: "Log the customer's fabric in; releases it to the workshop" })
  fabricReceived(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FabricReceivedDto,
  ) {
    return this.orders.markFabricReceived(user.id, id, dto.note);
  }

  @Post('bookings/:id/quote')
  @Roles('ADMIN', 'STAFF')
  quote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: QuoteStitchingDto,
  ) {
    return this.orders.quote(user.id, id, dto.fee);
  }

  @Post('bookings/:id/status')
  @Roles('ADMIN', 'STAFF')
  changeBookingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeStitchingOrderStatusDto,
  ) {
    return this.orders.changeStatus(user.id, id, dto.status);
  }

  // --- The design catalogue -------------------------------------------------

  @Get('option-groups')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Every design group and its options, deactivated ones too' })
  listOptionGroups() {
    return this.design.listOptionGroups();
  }

  @Post('option-groups')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Add a design group; no garment type means every garment' })
  createOptionGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStitchingOptionGroupDto,
  ) {
    return this.design.createOptionGroup(user.id, dto);
  }

  @Patch('option-groups/:id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Edit a design group' })
  updateOptionGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStitchingOptionGroupDto,
  ) {
    return this.design.updateOptionGroup(user.id, id, dto);
  }

  @Delete('option-groups/:id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Deactivate a design group (never hard-deleted)' })
  deactivateOptionGroup(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.design.deactivateOptionGroup(user.id, id);
  }

  @Post('option-groups/:id/options')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Add a style option to a group' })
  createOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateStitchingOptionDto,
  ) {
    return this.design.createOption(user.id, id, dto);
  }

  @Patch('options/:id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Edit a style option' })
  updateOption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStitchingOptionDto,
  ) {
    return this.design.updateOption(user.id, id, dto);
  }

  @Delete('options/:id')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Deactivate a style option (never hard-deleted)' })
  deactivateOption(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.design.deactivateOption(user.id, id);
  }
}
