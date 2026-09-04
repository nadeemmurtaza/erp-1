import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';

/**
 * GET /meta — what the admin nav (nav-registry.ts's navFor()) filters
 * module-tagged entries against, so a deployment that never turned on
 * `tax` (say) doesn't render a Tax nav item pointing at a 404.
 */
describe('Meta (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is reachable without a token and lists the enabled modules and packs', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/meta').expect(200);

    expect(Array.isArray(response.body.modules)).toBe(true);
    expect(Array.isArray(response.body.packs)).toBe(true);
    // Always on regardless of the MODULES allowlist — see modules.registry.ts.
    expect(response.body.modules).toEqual(
      expect.arrayContaining(['settings', 'users', 'addresses']),
    );
    expect(response.body.packs).toEqual(expect.arrayContaining(['core']));
  });

  it('matches this env\'s MODULES allowlist exactly, not a hardcoded guess', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/meta').expect(200);

    const allowlist = (process.env.MODULES ?? '').split(',').map((entry) => entry.trim());
    // Something present in the allowlist that this deployment never
    // registered (a typo, a retired module name) would be a silent no-op —
    // it's exactly as informative to assert it's absent from /meta's output.
    const spotCheck = allowlist.find((name) => name.length > 0) ?? 'catalog';
    expect(response.body.modules).toContain(spotCheck);

    // A togglable module absent from the allowlist must not appear.
    const known = ['inventory', 'purchasing', 'reports', 'tracking', 'tax', 'crm', 'stitching'];
    for (const name of known) {
      if (!allowlist.includes(name)) {
        expect(response.body.modules).not.toContain(name);
      }
    }
  });
});
