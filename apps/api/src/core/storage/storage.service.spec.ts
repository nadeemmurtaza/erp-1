import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from './storage.service';
import { AppConfigService } from '../config/app-config.service';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { SettingsService } from '../settings/settings.service';

describe('StorageService.putImage', () => {
  let service: StorageService;
  let local: any;
  let settings: any;

  const tinyPng = () => sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();

  beforeEach(async () => {
    local = { name: 'local', put: jest.fn(async (input) => ({ key: `k/${input.filename}`, url: `http://x/${input.filename}`, size: input.body.byteLength, contentType: input.contentType })) };
    const s3 = { name: 's3', put: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('local') };
    // Conversion on, as it ships. The off case has its own test below.
    settings = { get: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: AppConfigService, useValue: config },
        { provide: LocalStorageDriver, useValue: local },
        { provide: S3StorageDriver, useValue: s3 },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('converts a JPEG upload to WebP before storing it', async () => {
    const png = await tinyPng();
    const jpeg = await sharp(png).jpeg().toBuffer();

    const stored = await service.putImage({
      folder: 'products',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      body: jpeg,
    });

    expect(local.put).toHaveBeenCalledTimes(1);
    const putArg = local.put.mock.calls[0][0];
    expect(putArg.contentType).toBe('image/webp');
    expect(putArg.filename).toBe('photo.webp');
    expect(stored.contentType).toBe('image/webp');

    const meta = await sharp(putArg.body).metadata();
    expect(meta.format).toBe('webp');
  });

  it('converts a PNG upload to WebP and strips the original extension', async () => {
    const png = await tinyPng();

    await service.putImage({
      folder: 'stitching-jobs',
      filename: 'reference.photo.PNG',
      contentType: 'image/png',
      body: png,
    });

    const putArg = local.put.mock.calls[0][0];
    expect(putArg.filename).toBe('reference.photo.webp');
  });

  it('rejects an unsupported content type before touching the storage driver', async () => {
    await expect(
      service.putImage({ folder: 'products', filename: 'a.gif', contentType: 'image/gif', body: Buffer.from('x') }),
    ).rejects.toThrow(BadRequestException);
    expect(local.put).not.toHaveBeenCalled();
  });

  it('rejects a file over the size limit before touching the storage driver', async () => {
    const big = Buffer.alloc(9 * 1024 * 1024);
    await expect(
      service.putImage({ folder: 'products', filename: 'big.jpg', contentType: 'image/jpeg', body: big }),
    ).rejects.toThrow(BadRequestException);
    expect(local.put).not.toHaveBeenCalled();
  });

  it('rejects bytes that are not actually a decodable image', async () => {
    const notAnImage = Buffer.from('this is not an image');
    await expect(
      service.putImage({ folder: 'products', filename: 'fake.jpg', contentType: 'image/jpeg', body: notAnImage }),
    ).rejects.toThrow(BadRequestException);
    expect(local.put).not.toHaveBeenCalled();
  });

  it('keeps the original bytes when the WebP setting is off', async () => {
    settings.get.mockResolvedValue(false);
    const png = await tinyPng();

    await service.putImage({ body: png, filename: 'keep.png', contentType: 'image/png' } as never);

    const putArg = local.put.mock.calls[0][0];
    expect(putArg.contentType).toBe('image/png');
    expect(putArg.filename).toBe('keep.png');
    expect(putArg.body).toBe(png);
  });

  it('still rejects a non-image when the WebP setting is off', async () => {
    settings.get.mockResolvedValue(false);

    // The content type is what a caller claims; the bytes are what decides.
    await expect(
      service.putImage({
        body: Buffer.from('not an image at all'),
        filename: 'payload.png',
        contentType: 'image/png',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(local.put).not.toHaveBeenCalled();
  });
});

describe('StorageService.putDocument', () => {
  let service: StorageService;
  let local: any;

  const tinyPng = () => sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();

  beforeEach(async () => {
    local = { name: 'local', put: jest.fn(async (input) => ({ key: `k/${input.filename}`, url: `http://x/${input.filename}`, size: input.body.byteLength, contentType: input.contentType })) };
    const s3 = { name: 's3', put: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('local') };
    const settings = { get: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: AppConfigService, useValue: config },
        { provide: LocalStorageDriver, useValue: local },
        { provide: S3StorageDriver, useValue: s3 },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('stores a PDF as-is, never through sharp', async () => {
    const pdf = Buffer.from('%PDF-1.4 fake receipt bytes');
    const stored = await service.putDocument({
      folder: 'receipts',
      filename: 'receipt.pdf',
      contentType: 'application/pdf',
      body: pdf,
    });

    expect(local.put).toHaveBeenCalledTimes(1);
    const putArg = local.put.mock.calls[0][0];
    expect(putArg.contentType).toBe('application/pdf');
    expect(putArg.body).toBe(pdf);
    expect(stored.contentType).toBe('application/pdf');
  });

  it('converts an image receipt to WebP, same as putImage', async () => {
    const png = await tinyPng();
    await service.putDocument({ folder: 'receipts', filename: 'r.png', contentType: 'image/png', body: png });

    const putArg = local.put.mock.calls[0][0];
    expect(putArg.contentType).toBe('image/webp');
  });

  it('rejects a content type that is neither an image nor a PDF', async () => {
    await expect(
      service.putDocument({ folder: 'receipts', filename: 'r.txt', contentType: 'text/plain', body: Buffer.from('x') }),
    ).rejects.toThrow(BadRequestException);
    expect(local.put).not.toHaveBeenCalled();
  });

  it('rejects an oversized PDF before touching the storage driver', async () => {
    const big = Buffer.alloc(9 * 1024 * 1024);
    await expect(
      service.putDocument({ folder: 'receipts', filename: 'big.pdf', contentType: 'application/pdf', body: big }),
    ).rejects.toThrow(BadRequestException);
    expect(local.put).not.toHaveBeenCalled();
  });
});

describe('StorageService — 38-resilience-engineering.md WO-38.1, degradation matrix row "StorageDriver (S3/R2)"', () => {
  /**
   * The row's stated degraded behavior is "new uploads queue for retry."
   * This test proves what the code actually does today: `put()` has no
   * retry or queue of any kind (confirmed by reading `storage.service.ts`
   * in full) — a driver failure propagates straight to the caller. This is
   * a genuine gap between the degradation matrix's own text and the
   * codebase, named honestly here (and in doc 38's status blockquote)
   * rather than papered over with a test for behavior that does not exist.
   * Building a real upload retry queue is a separate, larger work order —
   * out of doc 38's own WO-38.1 (prove existing behavior), which is not a
   * license to invent a new mechanism.
   */
  it('propagates a driver failure directly to the caller — no queue, no retry, exists today', async () => {
    const local = { name: 'local', put: jest.fn().mockRejectedValue(new Error('ENOSPC: no space left on device')) };
    const s3 = { name: 's3', put: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('local') };
    const settings = { get: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: AppConfigService, useValue: config },
        { provide: LocalStorageDriver, useValue: local },
        { provide: S3StorageDriver, useValue: s3 },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    const service = module.get<StorageService>(StorageService);

    await expect(service.put({ folder: 'x', filename: 'a.bin', contentType: 'application/octet-stream', body: Buffer.from('x') })).rejects.toThrow(
      'ENOSPC',
    );
    expect(local.put).toHaveBeenCalledTimes(1);
  });
});
