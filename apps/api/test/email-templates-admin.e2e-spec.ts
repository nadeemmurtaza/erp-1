import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { EMAIL_TEMPLATE_CATALOG } from '../src/core/notifications/email/catalog';

/**
 * The "manage email templates" screen's backend: the list every staff
 * member sees, and the live preview each row opens. Every catalog entry must
 * actually render — a broken renderer here is a broken admin screen, not
 * just a broken test.
 */
describe('Admin email template catalog (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

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

    const signIn = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' })
      .expect(200);
    adminToken = signIn.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  it('refuses an anonymous request', async () => {
    await api().get('/api/v1/admin/email-templates').expect(401);
  });

  it('lists every registered template without leaking sample data', async () => {
    const response = await api()
      .get('/api/v1/admin/email-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(EMAIL_TEMPLATE_CATALOG.length);
    for (const entry of response.body) {
      expect(entry).not.toHaveProperty('sampleData');
      expect(typeof entry.triggerDescription).toBe('string');
      expect(['automatic', 'manual']).toContain(entry.trigger);
    }
  });

  it('404s on an unregistered template key', async () => {
    await api()
      .get('/api/v1/admin/email-templates/not.a.real.key/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('renders every catalog entry in both languages', async () => {
    for (const entry of EMAIL_TEMPLATE_CATALOG) {
      for (const locale of ['en', 'ur']) {
        const response = await api()
          .get(`/api/v1/admin/email-templates/${entry.key}/preview`)
          .query({ locale })
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);

        expect(response.body.subject.length).toBeGreaterThan(0);
        expect(response.body.html).toContain('<!doctype html>');
        expect(response.body.html).toContain(locale === 'ur' ? 'dir="rtl"' : 'dir="ltr"');
      }
    }
  });
});
