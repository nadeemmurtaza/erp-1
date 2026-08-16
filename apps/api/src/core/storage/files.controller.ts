import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { Public } from '../auth/decorators';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
};

/**
 * Serves files stored by the local storage driver.
 *
 * Only reachable when STORAGE_DRIVER=local; with S3 the CDN serves these URLs
 * directly and this controller is never hit.
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(private readonly config: AppConfigService) {}

  @Public()
  @Get('*path')
  async serve(@Param('path') path: string | string[], @Res() response: Response) {
    const key = Array.isArray(path) ? path.join('/') : path;
    const root = resolve(this.config.get('LOCAL_STORAGE_DIR'));
    const target = resolve(root, normalize(key));

    // Refuse anything that climbs out of the storage root.
    if (target !== root && !target.startsWith(root + sep)) {
      throw new NotFoundException();
    }

    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) {
      throw new NotFoundException();
    }

    response.setHeader(
      'Content-Type',
      CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    );
    response.setHeader('Content-Length', info.size);
    // Keys carry a random suffix, so a given URL's bytes never change.
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    createReadStream(target).pipe(response);
  }
}
