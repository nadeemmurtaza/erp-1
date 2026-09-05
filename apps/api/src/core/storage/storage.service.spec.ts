import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { StorageService } from './storage.service';
import { AppConfigService } from '../config/app-config.service';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';

describe('StorageService.putImage', () => {
  let service: StorageService;
  let local: any;

  const tinyPng = () => sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();

  beforeEach(async () => {
    local = { name: 'local', put: jest.fn(async (input) => ({ key: `k/${input.filename}`, url: `http://x/${input.filename}`, size: input.body.byteLength, contentType: input.contentType })) };
    const s3 = { name: 's3', put: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('local') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: AppConfigService, useValue: config },
        { provide: LocalStorageDriver, useValue: local },
        { provide: S3StorageDriver, useValue: s3 },
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
});
