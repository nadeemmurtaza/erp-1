import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { AuthenticatedOnly, CurrentUser, CustomerScope, RequirePermission } from '../../../core/auth/decorators';
import { StorageService } from '../../../core/storage/storage.service';
import type { ReturnStatus } from '../../../core/prisma/client';
import {
  CreateReturnReasonDto,
  CreateReturnRequestDto,
  DecideReturnRequestDto,
  InspectReturnRequestDto,
  ResolveReturnRequestDto,
} from './dto/returns.dto';
import { ReturnsService } from './returns.service';

interface UploadedPhoto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/** WO-6.8's `/admin/sales/returns` + `/[id]` — the inspection sheet. */
@ApiTags('admin/returns')
@Controller('admin/fulfilment/returns')
@RequirePermission('fulfilment.manage')
export class ReturnsAdminController {
  constructor(private readonly returns: ReturnsService) {}

  @Get('reasons')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  listReasons() {
    return this.returns.listReasons();
  }

  @Post('reasons')
  createReason(@Body() dto: CreateReturnReasonDto) {
    return this.returns.createReason(dto);
  }

  @Get()
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  list(@Query('status') status?: ReturnStatus) {
    return this.returns.listRequests({ status });
  }

  @Get(':id')
  @RequirePermission('fulfilment.view', 'fulfilment.manage')
  get(@Param('id') id: string) {
    return this.returns.getRequest(id);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    return this.returns.approve(id, user.id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DecideReturnRequestDto) {
    return this.returns.reject(id, user.id, dto);
  }

  @Post(':id/in-transit')
  markInTransit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.markInTransit(id, user.id);
  }

  @Post(':id/received')
  markReceived(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.markReceived(id, user.id);
  }

  @Post(':id/inspect')
  inspect(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: InspectReturnRequestDto) {
    return this.returns.inspect(id, dto, user.id);
  }

  @Post(':id/resolve')
  @ApiOperation({
    summary:
      'Close the return. For REFUND, call POST /admin/payments/:paymentId/refund first — this endpoint records the return\'s own resolution, not the money movement.',
  })
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResolveReturnRequestDto) {
    return this.returns.resolve(id, dto, user.id);
  }
}

/** The customer's own side of WO-6.6 — request a return, track it, attach photos. */
@ApiTags('returns')
@Controller('returns')
export class ReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly storage: StorageService,
  ) {}

  @AuthenticatedOnly()
  @CustomerScope('returns:read')
  @Get('reasons')
  listReasons() {
    return this.returns.listReasons();
  }

  @AuthenticatedOnly()
  @CustomerScope('returns:read')
  @Get('mine')
  @ApiOperation({ summary: "The signed-in customer's own return requests" })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.returns.listForUser(user.id);
  }

  @AuthenticatedOnly()
  @CustomerScope('returns:read')
  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.returns.getRequest(id, user.id);
  }

  @AuthenticatedOnly()
  @CustomerScope('returns:write')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReturnRequestDto) {
    return this.returns.createRequest(dto, user.id);
  }

  @AuthenticatedOnly()
  @CustomerScope('returns:write')
  @Post(':id/photos')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: UploadedPhoto | undefined,
  ) {
    if (!file) throw new BadRequestException('Choose a photo to upload.');
    const request = await this.returns.getRequest(id, user.id);

    const stored = await this.storage.putImage({
      folder: 'return-photos',
      filename: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });

    return this.returns.attachPhoto(id, stored.url, request.photoUrls);
  }
}
