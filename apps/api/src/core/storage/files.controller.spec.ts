import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { FilesController } from './files.controller';
import { AppConfigService } from '../config/app-config.service';

/**
 * H2 (security review) — RAG source PDFs (potentially HR/payroll documents)
 * must never be reachable through this public, unauthenticated route. Every
 * other key under the storage root is unaffected — the guard is scoped to
 * the exact `rag-sources` folder `RagCorpusService.createSource()` writes
 * into (`storage.putDocument({ folder: 'rag-sources', ... })`).
 */
describe('FilesController', () => {
  let controller: FilesController;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'files-controller-test-'));
    await mkdir(join(root, 'rag-sources', '2026', '09'), { recursive: true });
    await writeFile(join(root, 'rag-sources', '2026', '09', 'confidential.pdf'), '%PDF-1.4');
    await mkdir(join(root, 'products', '2026', '09'), { recursive: true });
    await writeFile(join(root, 'products', '2026', '09', 'photo.jpg'), 'jpeg-bytes');

    const config = { get: jest.fn().mockReturnValue(root) };
    const module = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: AppConfigService, useValue: config }],
    }).compile();
    controller = module.get(FilesController);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** A real writable stream (so `createReadStream(...).pipe(response)` works) with `setHeader` spied on top, since `express.Response` is itself a writable stream. */
  function fakeResponse() {
    const stream = new PassThrough();
    stream.resume(); // drain it — this test only cares about headers, not the body
    return Object.assign(stream, { setHeader: jest.fn() }) as any;
  }

  it('refuses any key under rag-sources, however deep, even though the file really exists', async () => {
    await expect(controller.serve(['rag-sources', '2026', '09', 'confidential.pdf'], fakeResponse())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a rag-sources key given as a single joined string path', async () => {
    await expect(controller.serve('rag-sources/2026/09/confidential.pdf', fakeResponse())).rejects.toThrow(NotFoundException);
  });

  it('still serves an ordinary public key (unaffected by the guard)', async () => {
    const response = fakeResponse();
    await controller.serve(['products', '2026', '09', 'photo.jpg'], response);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
  });
});
