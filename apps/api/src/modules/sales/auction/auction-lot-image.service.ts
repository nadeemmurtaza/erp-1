import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../../core/audit/audit.service';
import type { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { StorageService } from '../../../core/storage/storage.service';
import { lockAuctionStatus } from './auction-lock';
import { checkPhotoOrder, closeGap, LOT_PHOTO_FOLDER, MAX_LOT_PHOTOS, nextPhotoPosition } from './lot-photos';

/** A photograph as staff see it. The storage key never leaves this service. */
export interface LotImageView {
  id: string;
  url: string;
  order: number;
}

/** Uploaded file as Multer hands it over. */
export interface UploadedLotPhoto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

const NOT_DRAFT = 'Photos can only be changed on a draft auction. Unschedule it first.';

/**
 * A lot's photographs (launchpad-apps/234-auction-app.md, WO-234.12). They are
 * part of what bidders are told about the lot, so like its title and price they
 * change only while the auction is a draft, and every change runs under the
 * auction's row lock: that lock is what makes "the lot has ten" true at the
 * moment the eleventh is refused, and what keeps two uploads from taking the
 * same position.
 *
 * Failure mode: the object is stored first and recorded second, because a slow
 * disk or bucket must not hold the lock. If recording then fails, or finds the
 * lot full, the object is removed again at once; if that removal fails too the
 * key is logged for an operator. Nothing is ever recorded that is not stored.
 */
@Injectable()
export class AuctionLotImageService {
  private readonly logger = new Logger(AuctionLotImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async add(auctionId: string, lotId: string, file: UploadedLotPhoto, actorId: string): Promise<LotImageView> {
    // A cheap look before the file is stored, so a refusal that is already certain stores nothing.
    const lot = await this.prisma.auctionLot.findFirst({
      where: { id: lotId, auctionId },
      select: { status: true, auction: { select: { status: true } }, _count: { select: { images: true } } },
    });
    if (!lot) throw new NotFoundException('Lot not found.');
    if (lot.auction.status !== 'DRAFT') throw new ConflictException(NOT_DRAFT);
    if (lot.status === 'WITHDRAWN') throw new ConflictException('A withdrawn lot cannot take photos.');
    if (!nextPhotoPosition(lot._count.images).ok) throw this.full();

    // Decodes the bytes, so a file that only claims to be an image is a 400 here.
    const stored = await this.storage.putImage({
      folder: LOT_PHOTO_FOLDER,
      filename: file.originalname,
      contentType: file.mimetype,
      body: file.buffer,
    });

    let image;
    try {
      image = await this.prisma.$transaction(async (tx) => {
        const status = await lockAuctionStatus(tx, auctionId);
        if (status !== 'DRAFT') throw new ConflictException(NOT_DRAFT);
        const current = await tx.auctionLot.findFirst({ where: { id: lotId, auctionId }, select: { status: true } });
        if (!current) throw new NotFoundException('Lot not found.');
        if (current.status === 'WITHDRAWN') throw new ConflictException('A withdrawn lot cannot take photos.');
        const position = nextPhotoPosition(await tx.auctionLotImage.count({ where: { lotId } }));
        if (!position.ok) throw this.full();
        return tx.auctionLotImage.create({
          data: { lotId, url: stored.url, storageKey: stored.key, order: position.order },
          select: { id: true, url: true, order: true },
        });
      });
    } catch (error) {
      await this.discard(stored.key);
      throw error;
    }

    await this.audit.record({
      actorId,
      action: 'auction.lot_photo_added',
      entity: 'AuctionLot',
      entityId: lotId,
      data: { auctionId, imageId: image.id, order: image.order },
    });
    return image;
  }

  async reorder(auctionId: string, lotId: string, imageIds: readonly string[], actorId: string): Promise<LotImageView[]> {
    const images = await this.prisma.$transaction(async (tx) => {
      await this.lockLot(tx, auctionId, lotId);
      const current = await tx.auctionLotImage.findMany({ where: { lotId }, orderBy: { order: 'asc' }, select: { id: true } });
      const verdict = checkPhotoOrder(
        current.map((image) => image.id),
        imageIds,
      );
      if (!verdict.ok) {
        throw new BadRequestException(
          verdict.problem === 'MISSING'
            ? 'List every photo of the lot, in the order you want. This lot has changed; reload it.'
            : verdict.problem === 'DUPLICATE'
              ? 'A photo can appear only once in the order.'
              : 'One of those photos does not belong to this lot.',
        );
      }
      for (const [order, id] of imageIds.entries()) {
        await tx.auctionLotImage.update({ where: { id }, data: { order } });
      }
      return tx.auctionLotImage.findMany({ where: { lotId }, orderBy: { order: 'asc' }, select: { id: true, url: true, order: true } });
    });

    await this.audit.record({
      actorId,
      action: 'auction.lot_photos_reordered',
      entity: 'AuctionLot',
      entityId: lotId,
      data: { auctionId, imageIds: [...imageIds] },
    });
    return images;
  }

  /** Removes one photograph and closes the gap, returning what the lot has left. */
  async remove(auctionId: string, lotId: string, imageId: string, actorId: string): Promise<LotImageView[]> {
    const { removed, images } = await this.prisma.$transaction(async (tx) => {
      await this.lockLot(tx, auctionId, lotId);
      const target = await tx.auctionLotImage.findFirst({ where: { id: imageId, lotId }, select: { id: true, storageKey: true } });
      if (!target) throw new NotFoundException('That photo is not on this lot.');
      await tx.auctionLotImage.delete({ where: { id: imageId } });
      const rest = await tx.auctionLotImage.findMany({ where: { lotId }, orderBy: { order: 'asc' }, select: { id: true } });
      for (const { id, order } of closeGap(rest.map((image) => image.id))) {
        await tx.auctionLotImage.update({ where: { id }, data: { order } });
      }
      return {
        removed: target,
        images: await tx.auctionLotImage.findMany({ where: { lotId }, orderBy: { order: 'asc' }, select: { id: true, url: true, order: true } }),
      };
    });

    await this.discard(removed.storageKey);
    await this.audit.record({
      actorId,
      action: 'auction.lot_photo_removed',
      entity: 'AuctionLot',
      entityId: lotId,
      data: { auctionId, imageId },
    });
    return images;
  }

  /** The auction is a draft and the lot is on it and not withdrawn, all read under the auction's row lock. */
  private async lockLot(tx: Prisma.TransactionClient, auctionId: string, lotId: string): Promise<void> {
    const status = await lockAuctionStatus(tx, auctionId);
    if (status !== 'DRAFT') throw new ConflictException(NOT_DRAFT);
    const lot = await tx.auctionLot.findFirst({ where: { id: lotId, auctionId }, select: { status: true } });
    if (!lot) throw new NotFoundException('Lot not found.');
    if (lot.status === 'WITHDRAWN') throw new ConflictException('A withdrawn lot cannot take photos.');
  }

  private full(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'LOT_PHOTOS_FULL',
      message: `A lot can have ${MAX_LOT_PHOTOS} photos. Remove one to add another.`,
    });
  }

  /** Removes a stored object. A failure is logged with the key and never fails the act that wanted it gone. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`Could not remove stored lot photo ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
