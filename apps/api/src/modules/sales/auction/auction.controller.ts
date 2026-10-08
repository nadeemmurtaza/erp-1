import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../core/auth/auth.constants';
import { CurrentUser, RequirePermission } from '../../../core/auth/decorators';
import { MAX_IMAGE_BYTES } from '../../../core/storage/storage.service';
import { AuctionLotImageService, type UploadedLotPhoto } from './auction-lot-image.service';
import { AuctionService } from './auction.service';
import {
  AuctionListQueryDto,
  BidListQueryDto,
  CancelAuctionDto,
  CreateAuctionDto,
  CreateAuctionLotDto,
  ReorderLotImagesDto,
  UpdateAuctionDto,
  UpdateAuctionLotDto,
} from './dto/auction.dto';

/**
 * launchpad-apps/234-auction-app.md (WO-234.1). Drafting and editing sit
 * behind `auction.manage`; putting an auction on the calendar — and taking it
 * off again — is `auction.publish`, so the person who drafts a sale is not
 * automatically the one who commits the business to it. The lot's hidden
 * reserve is returned only to a holder of `auction.manage`; a read-only
 * holder never sees it. The bid ledger and its integrity check are read-only
 * and need only `auction.view`. The list and the page also open for a holder of
 * `auction.bidders.manage` (WO-234.5) and `auction.settle` (WO-234.6), so a
 * person who only approves bidders, or only chases what winners owe, can reach
 * them; neither key shows a reserve.
 */
@ApiTags('admin/auctions')
@Controller('admin/auctions')
export class AuctionController {
  constructor(
    private readonly auctions: AuctionService,
    private readonly photos: AuctionLotImageService,
  ) {}

  @Get()
  @RequirePermission('auction.view', 'auction.manage', 'auction.bidders.manage', 'auction.settle')
  @ApiOperation({ summary: 'Auctions, newest first, optionally filtered by status' })
  list(@Query() query: AuctionListQueryDto) {
    return this.auctions.list(query);
  }

  @Get(':id')
  @RequirePermission('auction.view', 'auction.manage', 'auction.bidders.manage', 'auction.settle')
  @ApiOperation({ summary: 'One auction with its lots' })
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.get(id, user.permissions.includes('auction.manage'));
  }

  @Post()
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Draft an auction' })
  create(@Body() dto: CreateAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Edit a draft auction' })
  update(@Param('id') id: string, @Body() dto: UpdateAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.update(id, dto, user.id);
  }

  @Post(':id/lots')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Add a lot to a draft auction' })
  addLot(@Param('id') id: string, @Body() dto: CreateAuctionLotDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.addLot(id, dto, user.id);
  }

  @Patch(':id/lots/:lotId')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Edit a lot on a draft auction' })
  updateLot(
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Body() dto: UpdateAuctionLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.auctions.updateLot(id, lotId, dto, user.id);
  }

  @Post(':id/lots/:lotId/withdraw')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Withdraw a lot from a draft auction — kept on record, never deleted' })
  withdrawLot(@Param('id') id: string, @Param('lotId') lotId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.withdrawLot(id, lotId, user.id);
  }

  @Post(':id/lots/:lotId/images')
  @RequirePermission('auction.manage')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  // The size is refused while the file arrives, so an oversized upload is never held whole in memory; the storage service checks the same number again after reading it.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Add a photo to a lot of a draft auction (at most 10 a lot)' })
  addPhoto(
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @UploadedFile() file: UploadedLotPhoto | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Choose an image file to upload.');
    return this.photos.add(id, lotId, file, user.id);
  }

  @Patch(':id/lots/:lotId/images/order')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Put a lot’s photos in order; the first is the cover. List every photo, once' })
  reorderPhotos(
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Body() dto: ReorderLotImagesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.photos.reorder(id, lotId, dto.imageIds, user.id);
  }

  @Delete(':id/lots/:lotId/images/:imageId')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Remove a photo from a lot of a draft auction; returns the photos that are left' })
  removePhoto(
    @Param('id') id: string,
    @Param('lotId') lotId: string,
    @Param('imageId') imageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.photos.remove(id, lotId, imageId, user.id);
  }

  @Get(':id/lots/:lotId/bids')
  @RequirePermission('auction.view', 'auction.manage')
  @ApiOperation({ summary: 'A lot’s accepted bids, newest first, bidders by alias only' })
  listBids(@Param('id') id: string, @Param('lotId') lotId: string, @Query() query: BidListQueryDto) {
    return this.auctions.listBids(id, lotId, query);
  }

  @Get(':id/lots/:lotId/bids/verify')
  @RequirePermission('auction.view', 'auction.manage')
  @ApiOperation({ summary: 'Re-walk a lot’s bid chain and say whether anything was inserted, edited or removed' })
  verifyBids(@Param('id') id: string, @Param('lotId') lotId: string) {
    return this.auctions.verifyBids(id, lotId);
  }

  @Post(':id/schedule')
  @RequirePermission('auction.publish')
  @ApiOperation({ summary: 'Schedule a draft auction to open at its start time' })
  schedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.schedule(id, user.id);
  }

  @Post(':id/unschedule')
  @RequirePermission('auction.publish')
  @ApiOperation({ summary: 'Return a scheduled auction to draft, before it opens' })
  unschedule(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.unschedule(id, user.id);
  }

  @Post(':id/cancel')
  @RequirePermission('auction.manage')
  @ApiOperation({ summary: 'Cancel a draft or scheduled auction, with a reason' })
  cancel(@Param('id') id: string, @Body() dto: CancelAuctionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.auctions.cancel(id, dto.reason, user.id);
  }
}
