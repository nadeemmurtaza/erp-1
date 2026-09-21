import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { AppConfigService } from '../config/app-config.service';
import { SettingsService } from '../settings/settings.service';
import { SettingKey } from '../settings/settings.defaults';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import type { PutFileInput, StorageDriver, StoredFile } from './storage.driver';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
/** Receipts (WO-B.2): a photo of a receipt, or a PDF a supplier emailed. */
const ALLOWED_DOCUMENT_TYPES = new Set([...ALLOWED_IMAGE_TYPES, 'application/pdf']);

/** Matches Next.js's own default WebP quality — a well-tested size/quality balance. */
const WEBP_QUALITY = 75;

/**
 * Front door for file storage. Callers never touch a driver directly, so
 * switching STORAGE_DRIVER from local to s3 changes nothing but the env file.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  constructor(
    config: AppConfigService,
    local: LocalStorageDriver,
    s3: S3StorageDriver,
    private readonly settings: SettingsService,
  ) {
    this.driver = config.get('STORAGE_DRIVER') === 's3' ? s3 : local;
    this.logger.log(`Storage driver: ${this.driver.name}`);
  }

  put(input: PutFileInput): Promise<StoredFile> {
    return this.driver.put(input);
  }

  /**
   * Stores an image after checking its type and size, converting it to WebP
   * first — every image this app serves ends up in one format, smaller than
   * JPEG/PNG at equal visual quality, which is exactly what Lighthouse's
   * "serve images in next-gen formats" check (and so, page-speed SEO) rewards.
   */
  async putImage(input: PutFileInput): Promise<StoredFile> {
    if (!ALLOWED_IMAGE_TYPES.has(input.contentType)) {
      throw new BadRequestException(
        `Unsupported image type "${input.contentType}". Use JPEG, PNG, WebP or AVIF.`,
      );
    }
    if (input.body.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
    }

    // A Setting, not an env var: turning conversion off is a shop's decision
    // and has to be reversible from the back office without a deploy
    // (House Rule 4). Failing open to `true` keeps the default behaviour if
    // the row is missing.
    const toWebp = (await this.settings.get<boolean>(SettingKey.MediaWebpEnabled)) !== false;

    if (!toWebp) {
      /*
       * Still decoded before storing, even when the original is kept. The
       * type check above reads the browser's declared content type, which a
       * caller can simply lie about; sharp reading the header is what
       * actually establishes the bytes are an image. Skipping that here
       * would have made switching this setting off a way to upload anything.
       */
      try {
        await sharp(input.body).metadata();
      } catch {
        throw new BadRequestException('That file is not a valid image.');
      }
      return this.driver.put(input);
    }

    let body: Buffer;
    try {
      body = await sharp(input.body).rotate().webp({ quality: WEBP_QUALITY }).toBuffer();
    } catch {
      throw new BadRequestException('That file is not a valid image.');
    }

    return this.driver.put({
      ...input,
      body,
      filename: `${input.filename.replace(/\.[^./]+$/, '')}.webp`,
      contentType: 'image/webp',
    });
  }

  /**
   * A receipt: an image (converted to WebP via putImage) or a PDF (stored
   * as-is — sharp cannot decode a PDF, and converting a receipt away from
   * PDF would lose the one thing that makes it a legible source document).
   * Same size cap as putImage — one number for "how big may an upload be",
   * not a second one invented for this file type.
   */
  async putDocument(input: PutFileInput): Promise<StoredFile> {
    if (!ALLOWED_DOCUMENT_TYPES.has(input.contentType)) {
      throw new BadRequestException(
        `Unsupported file type "${input.contentType}". Use JPEG, PNG, WebP, AVIF or PDF.`,
      );
    }
    if (input.body.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `File is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
    }
    if (input.contentType === 'application/pdf') {
      return this.driver.put(input);
    }
    return this.putImage(input);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  urlFor(key: string): string {
    return this.driver.urlFor(key);
  }
}
