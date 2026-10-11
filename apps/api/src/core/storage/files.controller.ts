import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, normalize, relative, resolve, sep } from 'node:path';
import { Controller, Get, Logger, NotFoundException, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { Public } from '../auth/decorators';
import { StorageUrlSigner } from './storage-url-signer';
import { cacheControlFor, folderOf, visibilityOf } from './storage-visibility';

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
 *
 * `@Public()` because two kinds of caller have no session: a storefront
 * visitor loading a product photo, and the API's own vision provider fetching
 * an OCR or photo-search image. What a request may reach is decided by the
 * key's folder (`storage-visibility.ts`, ADR-091): a public or ungated folder
 * is served to anyone holding the URL; a private one only on a URL from
 * `StorageService.signedUrlFor()`, whose token must name this exact key.
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  private readonly logger = new Logger(FilesController.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly signer: StorageUrlSigner,
  ) {}

  @Public()
  @Get('*path')
  async serve(
    @Param('path') path: string | string[],
    @Query('token') token: unknown,
    @Res() response: Response,
  ) {
    const key = Array.isArray(path) ? path.join('/') : path;
    const root = resolve(this.config.get('LOCAL_STORAGE_DIR'));
    const target = resolve(root, normalize(key));

    // Refuse anything that climbs out of the storage root.
    if (target !== root && !target.startsWith(root + sep)) {
      throw new NotFoundException();
    }

    // Only a key exactly as the driver stores it. `products/../rag-sources/…`,
    // `./rag-sources/…` and `rag-sources%2F…` (one segment holding slashes)
    // each open a real file while their first segment names another folder,
    // so every folder rule below would judge the wrong one (ADR-091).
    if (relative(root, target).split(sep).join('/') !== key) {
      throw new NotFoundException();
    }

    // Security review H2 — RAG source PDFs (potentially HR/payroll
    // documents) must never be reachable through this public, unauthenticated
    // route, on local storage any more than on S3. The only authenticated
    // path to one is `RagAdminController`'s own `/admin/rag/sources/:id/file`
    // download route.
    if (folderOf(key) === 'rag-sources') {
      throw new NotFoundException();
    }

    // A private object is served only on a signed URL naming this exact key.
    // A missing, expired or foreign token reads as "no such file", so a probe
    // cannot tell a private object from an absent one.
    const visibility = visibilityOf(key);
    if (visibility === 'private' && !(await this.signer.verify(token, key))) {
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
    // Immutable for a public folder (keys carry a random suffix, so a URL's
    // bytes never change); never kept by a shared cache otherwise (ADR-091).
    response.setHeader('Cache-Control', cacheControlFor(visibility));

    if (visibility === 'private') {
      // `key` is the verified token's own subject — a value this API minted.
      this.logger.log(`Served private object ${key} on a signed URL.`);
    }

    createReadStream(target).pipe(response);
  }
}
