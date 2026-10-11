import { Logger, NotFoundException, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PassThrough } from 'node:stream';
import { FilesController } from './files.controller';
import { LocalStorageDriver } from './local-storage.driver';
import { StorageUrlSigner } from './storage-url-signer';
import { AppConfigService } from '../config/app-config.service';

const SECRET = 'files-controller-spec-secret-at-least-32-characters';

/**
 * What `GET files/*path` may serve (ADR-091). Private is the default: only a
 * public folder is served to anyone; the four ungated folders are served by
 * bare URL as named debt, but never cached by a shared cache; every other
 * folder needs a signed URL naming the exact key. H2 (security review) —
 * `rag-sources` is refused outright, signed or not, however the path is
 * spelled: `RagCorpusService.createSource()` writes there
 * (`storage.putDocument({ folder: 'rag-sources', ... })`).
 */
describe('FilesController', () => {
  let controller: FilesController;
  let signer: StorageUrlSigner;
  let jwt: JwtService;
  let root: string;
  let publicUrl = 'http://files.test/files';

  const config = {
    get: jest.fn((name: string) => ({ LOCAL_STORAGE_DIR: root, JWT_ACCESS_SECRET: SECRET, LOCAL_STORAGE_PUBLIC_URL: publicUrl })[name]),
  };

  async function store(key: string, body: string): Promise<void> {
    await mkdir(join(root, dirname(key)), { recursive: true });
    await writeFile(join(root, key), body);
  }

  async function compile() {
    return Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        StorageUrlSigner,
        LocalStorageDriver,
        { provide: JwtService, useValue: new JwtService() },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'files-controller-test-'));
    await store('rag-sources/2026/09/confidential.pdf', '%PDF-1.4 PAYROLL-SECRET');
    await store('products/2026/09/photo.jpg', 'jpeg-bytes');
    await store('payment-receipts/2026/09/receipt.webp', 'receipt-bytes');
    await store('visual-search/2026/09/shopper.webp', 'shopper-bytes');
    await store('documents/2026/09/contract.pdf', '%PDF-1.4 contract');

    const module = await compile();
    controller = module.get(FilesController);
    signer = module.get(StorageUrlSigner);
    jwt = module.get(JwtService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A real writable stream (so `createReadStream(...).pipe(response)` works) with `setHeader` spied on top, since `express.Response` is itself a writable stream. */
  function fakeResponse() {
    const stream = new PassThrough();
    stream.resume(); // drain it — these cases only care about headers, not the body
    return Object.assign(stream, { setHeader: jest.fn() }) as any;
  }

  const cacheControlOf = (response: any): string | undefined =>
    response.setHeader.mock.calls.find((call: unknown[]) => call[0] === 'Cache-Control')?.[1];

  describe('H2 — rag-sources is never served', () => {
    it('refuses any key under rag-sources, however deep, even though the file really exists', async () => {
      await expect(controller.serve(['rag-sources', '2026', '09', 'confidential.pdf'], undefined, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a rag-sources key given as a single joined string path', async () => {
      await expect(controller.serve('rag-sources/2026/09/confidential.pdf', undefined, fakeResponse())).rejects.toThrow(NotFoundException);
    });

    it('refuses it even on a valid signed token — RagAdminController is the only way to those bytes', async () => {
      const token = await signer.sign('rag-sources/2026/09/confidential.pdf', 60);
      await expect(controller.serve(['rag-sources', '2026', '09', 'confidential.pdf'], token, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    // Each of these opens the rag-sources file on disk while its first
    // segment says something else — the shapes that got past the old check.
    it.each([
      [['products', '..', 'rag-sources', '2026', '09', 'confidential.pdf']],
      [['.', 'rag-sources', '2026', '09', 'confidential.pdf']],
      [['products/../rag-sources/2026/09/confidential.pdf']],
      [['rag-sources/2026/09/confidential.pdf']],
      [['RAG-SOURCES', '2026', '09', 'confidential.pdf']],
      ['products/../rag-sources/2026/09/confidential.pdf'],
    ])('refuses the non-canonical or disguised spelling %j', async (path) => {
      await expect(controller.serve(path as string | string[], undefined, fakeResponse())).rejects.toThrow(NotFoundException);
    });
  });

  describe('a public folder', () => {
    it('is served to anyone and cached as immutable', async () => {
      const response = fakeResponse();
      await controller.serve(['products', '2026', '09', 'photo.jpg'], undefined, response);
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(cacheControlOf(response)).toBe('public, max-age=31536000, immutable');
    });
  });

  describe('an ungated folder (ADR-091 named debt)', () => {
    it('is still served by bare URL, but no shared cache may keep it', async () => {
      const response = fakeResponse();
      await controller.serve(['payment-receipts', '2026', '09', 'receipt.webp'], undefined, response);
      expect(cacheControlOf(response)).toBe('private, no-store');
    });
  });

  describe('a private folder — the default', () => {
    it('refuses a folder nobody declared public, even though the file exists', async () => {
      await expect(controller.serve(['documents', '2026', '09', 'contract.pdf'], undefined, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses visual-search with no token, or with one that is not a single string', async () => {
      const token = await signer.sign('visual-search/2026/09/shopper.webp', 60);
      await expect(controller.serve(['visual-search', '2026', '09', 'shopper.webp'], undefined, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
      await expect(controller.serve(['visual-search', '2026', '09', 'shopper.webp'], [token, token], fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a valid token minted for a different key', async () => {
      const token = await signer.sign('visual-search/2026/09/someone-else.webp', 60);
      await expect(controller.serve(['visual-search', '2026', '09', 'shopper.webp'], token, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses an expired token', async () => {
      const past = Math.floor(Date.now() / 1000) - 120;
      const expired = await jwt.signAsync(
        { sub: 'visual-search/2026/09/shopper.webp', aud: 'storage-object', iat: past, exp: past + 60 },
        { secret: SECRET, algorithm: 'HS256' },
      );
      await expect(controller.serve(['visual-search', '2026', '09', 'shopper.webp'], expired, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a session access token signed with the same secret', async () => {
      const session = await jwt.signAsync({ sub: 'clxuser000000000000000000' }, { secret: SECRET, expiresIn: 900 });
      await expect(controller.serve(['visual-search', '2026', '09', 'shopper.webp'], session, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cannot stretch a valid token to the same file through a non-canonical path', async () => {
      const token = await signer.sign('visual-search/2026/09/shopper.webp', 60);
      await expect(
        controller.serve(['visual-search', '2026', '09', '..', '09', 'shopper.webp'], token, fakeResponse()),
      ).rejects.toThrow(NotFoundException);
    });

    it('serves the object on a valid token for exactly its key, never cached by a shared cache', async () => {
      const token = await signer.sign('visual-search/2026/09/shopper.webp', 60);
      const response = fakeResponse();
      await controller.serve(['visual-search', '2026', '09', 'shopper.webp'], token, response);
      expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
      expect(cacheControlOf(response)).toBe('private, no-store');
    });

    it('logs every private serve by key, and never the token', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      try {
        const token = await signer.sign('visual-search/2026/09/shopper.webp', 60);
        await controller.serve(['visual-search', '2026', '09', 'shopper.webp'], token, fakeResponse());

        expect(log).toHaveBeenCalledWith(expect.stringContaining('visual-search/2026/09/shopper.webp'));
        expect(log.mock.calls.flat().join(' ')).not.toContain(token);
      } finally {
        log.mockRestore();
      }
    });

    it('answers a valid token for a key that does not exist like any other missing file', async () => {
      const token = await signer.sign('visual-search/2026/09/gone.webp', 60);
      await expect(controller.serve(['visual-search', '2026', '09', 'gone.webp'], token, fakeResponse())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  /**
   * The same rules through real Nest/Express routing, with raw request paths
   * (Node's http.request sends `..` and `%2F` as written, as `curl
   * --path-as-is` would). The old check let five of these return the
   * rag-sources PDF; the unit cases above guess how Express splits a path,
   * these do not.
   */
  describe('over HTTP', () => {
    let app: INestApplication;
    let port: number;

    beforeEach(async () => {
      app = (await compile()).createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      port = (app.getHttpServer().address() as { port: number }).port;
      publicUrl = `http://127.0.0.1:${port}/files`;
    });

    afterEach(async () => {
      await app.close();
      publicUrl = 'http://files.test/files';
    });

    function get(path: string): Promise<{ status: number; body: string; cacheControl?: string }> {
      return new Promise((resolve, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body, cacheControl: res.headers['cache-control'] }));
        });
        req.on('error', reject);
        req.end();
      });
    }

    it.each([
      '/files/rag-sources/2026/09/confidential.pdf',
      '/files/products/../rag-sources/2026/09/confidential.pdf',
      '/files/products%2F..%2Frag-sources%2F2026%2F09%2Fconfidential.pdf',
      '/files/./rag-sources/2026/09/confidential.pdf',
      '/files/rag-sources%2F2026%2F09%2Fconfidential.pdf',
      '/files/rag-sources%2f2026/09/confidential.pdf',
      '/files/RAG-SOURCES/2026/09/confidential.pdf',
      '/files//rag-sources/2026/09/confidential.pdf',
    ])('never returns the rag-sources PDF for %s', async (path) => {
      const response = await get(path);
      expect(response.status).toBe(404);
      expect(response.body).not.toContain('PAYROLL-SECRET');
    });

    it('serves a public product photo to anyone', async () => {
      const response = await get('/files/products/2026/09/photo.jpg');
      expect(response.status).toBe(200);
      expect(response.body).toBe('jpeg-bytes');
      expect(response.cacheControl).toBe('public, max-age=31536000, immutable');
    });

    it('serves a private object end to end on the URL LocalStorageDriver.signedUrlFor() mints, and refuses its plain URL', async () => {
      const driver = (await compile()).get(LocalStorageDriver);
      const key = 'visual-search/2026/09/shopper.webp';

      const signed = new URL(await driver.signedUrlFor(key, 60));
      const served = await get(`${signed.pathname}${signed.search}`);
      expect(served.status).toBe(200);
      expect(served.body).toBe('shopper-bytes');
      expect(served.cacheControl).toBe('private, no-store');

      const plain = new URL(driver.urlFor(key));
      const refused = await get(plain.pathname);
      expect(refused.status).toBe(404);
      expect(refused.body).not.toContain('shopper-bytes');
    });
  });
});
