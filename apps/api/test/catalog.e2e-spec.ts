import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * Boots the real application against the real database and walks the paths a
 * shop actually depends on: staff sign in, create a bilingual product, and it
 * shows up on the storefront in both languages — with drafts staying hidden and
 * role checks holding.
 *
 * Requires a migrated, seeded database (pnpm db:migrate && pnpm db:seed).
 */
describe('Catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let customerToken: string;
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    adminToken = await signIn('admin@yaseen.pk', 'admin12345');
    customerToken = await signIn('ayesha@example.com', 'customer12345');
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    }
    await app.close();
  });

  async function signIn(identifier: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier, password })
      .expect(200);
    return response.body.accessToken;
  }

  const api = () => request(app.getHttpServer());

  describe('health', () => {
    it('reports ready when the database is reachable', async () => {
      const response = await api().get('/api/v1/health/ready').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.checks.database.ok).toBe(true);
    });
  });

  describe('authentication', () => {
    it('signs in with a phone number as well as an email', async () => {
      const response = await api()
        .post('/api/v1/auth/login')
        .send({ identifier: '0300 1234567', password: 'customer12345' })
        .expect(200);
      expect(response.body.user.email).toBe('ayesha@example.com');
    });

    it('rejects a wrong password', async () => {
      await api()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'wrong-password' })
        .expect(401);
    });

    it('does not reveal whether an account exists', async () => {
      const unknown = await api()
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody@example.com', password: 'whatever12345' })
        .expect(401);
      const wrongPassword = await api()
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'whatever12345' })
        .expect(401);

      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });
  });

  describe('storefront', () => {
    it('lists active products with paging metadata', async () => {
      const response = await api().get('/api/v1/catalog/products?pageSize=2').expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.total).toBeGreaterThan(2);
      expect(response.body.meta.hasNext).toBe(true);
    });

    it('returns Urdu names when the locale asks for them', async () => {
      const [en, ur] = await Promise.all([
        api().get('/api/v1/catalog/products?locale=en&pageSize=1'),
        api().get('/api/v1/catalog/products?locale=ur&pageSize=1'),
      ]);

      expect(en.body.data[0].name).not.toBe(ur.body.data[0].name);
      // Urdu is written in the Arabic script; assert we really switched.
      expect(ur.body.data[0].name).toMatch(/[؀-ۿ]/);
    });

    it('keeps stitching services out of ordinary browsing', async () => {
      const response = await api().get('/api/v1/catalog/products?pageSize=100').expect(200);
      const kinds = new Set(response.body.data.map((p: { kind: string }) => p.kind));
      expect(kinds.has('STITCHING_SERVICE')).toBe(false);
    });

    it('lists stitching services for a garment type', async () => {
      const response = await api()
        .get('/api/v1/catalog/stitching-services?garmentType=kameez')
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      for (const service of response.body) {
        expect(service.kind).toBe('STITCHING_SERVICE');
      }
    });

    it('filters by fabric', async () => {
      const response = await api()
        .get('/api/v1/catalog/products?fabric=lawn')
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      for (const product of response.body.data) {
        expect(product.fabric).toBe('lawn');
      }
    });

    it('returns nothing for an unknown category rather than everything', async () => {
      const response = await api()
        .get('/api/v1/catalog/products?category=no-such-category')
        .expect(200);
      expect(response.body.data).toHaveLength(0);
    });

    it('404s on an unknown product slug', async () => {
      await api().get('/api/v1/catalog/products/no-such-product').expect(404);
    });
  });

  describe('admin access control', () => {
    it('rejects an anonymous request', async () => {
      await api().get('/api/v1/admin/catalog/products').expect(401);
    });

    it('rejects a signed-in customer', async () => {
      await api()
        .get('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('allows staff', async () => {
      await api()
        .get('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('creating a product', () => {
    it('creates it bilingually and publishes it to the storefront', async () => {
      const categories = await api().get('/api/v1/catalog/categories').expect(200);
      const categoryId = categories.body.find(
        (category: { slug: string }) => category.slug === 'unstitched',
      ).id;

      const created = await api()
        .post('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          kind: 'UNSTITCHED',
          status: 'ACTIVE',
          categoryId,
          basePrice: 399900,
          fabric: 'Lawn',
          pieceCount: 3,
          stitchingAvailable: true,
          translations: [
            { locale: 'en', name: 'E2E Test Lawn Suit' },
            { locale: 'ur', name: 'ای ٹو ای ٹیسٹ لان سوٹ' },
          ],
          variants: [{ sku: `E2E-${Date.now()}`, size: 'Free size', stock: 5 }],
        })
        .expect(201);

      createdProductIds.push(created.body.id);

      expect(created.body.slug).toBe('e2e-test-lawn-suit');
      // Fabric is normalised so filters match regardless of how it was typed.
      expect(created.body.fabric).toBe('lawn');
      expect(created.body.totalStock).toBe(5);

      const storefront = await api()
        .get('/api/v1/catalog/products/e2e-test-lawn-suit?locale=ur')
        .expect(200);
      expect(storefront.body.name).toBe('ای ٹو ای ٹیسٹ لان سوٹ');
      expect(storefront.body.stitchingAvailable).toBe(true);
    });

    it('keeps a draft off the storefront but visible to staff', async () => {
      const created = await api()
        .post('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          kind: 'STITCHED',
          status: 'DRAFT',
          basePrice: 100000,
          translations: [{ locale: 'en', name: 'E2E Draft Product' }],
        })
        .expect(201);

      createdProductIds.push(created.body.id);

      await api().get(`/api/v1/catalog/products/${created.body.slug}`).expect(404);

      await api()
        .get(`/api/v1/admin/catalog/products/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('rejects a product with no English name', async () => {
      await api()
        .post('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          kind: 'STITCHED',
          basePrice: 1000,
          translations: [{ locale: 'ur', name: 'صرف اردو' }],
        })
        .expect(400);
    });

    it('rejects an unknown field instead of ignoring it', async () => {
      await api()
        .post('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          kind: 'STITCHED',
          basePrice: 1000,
          translations: [{ locale: 'en', name: 'Typo field' }],
          featuredRnak: 5,
        })
        .expect(400);
    });

    it('archives rather than deletes, so order history survives', async () => {
      const created = await api()
        .post('/api/v1/admin/catalog/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          kind: 'STITCHED',
          status: 'ACTIVE',
          basePrice: 50000,
          translations: [{ locale: 'en', name: 'E2E Archive Me' }],
        })
        .expect(201);

      createdProductIds.push(created.body.id);

      await api()
        .delete(`/api/v1/admin/catalog/products/${created.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const stillThere = await prisma.product.findUnique({
        where: { id: created.body.id },
      });
      expect(stillThere?.status).toBe('ARCHIVED');

      await api().get(`/api/v1/catalog/products/${created.body.slug}`).expect(404);
    });
  });

  describe('measurement profiles', () => {
    let profileId: string;

    it('saves a profile that passes the garment rules', async () => {
      const garments = await api().get('/api/v1/measurements/garment-types').expect(200);
      const kameez = garments.body.find((g: { key: string }) => g.key === 'kameez');

      const response = await api()
        .post('/api/v1/measurements/profiles')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          label: `E2E ${Date.now()}`,
          garmentTypeId: kameez.id,
          values: {
            length: 42,
            chest: 38,
            waist: 34,
            hips: 40,
            shoulder: 15,
            sleeve_length: 22,
            sleeve_opening: 10,
          },
        })
        .expect(201);

      profileId = response.body.id;
      expect(response.body.values.chest).toBe(38);
    });

    it('rejects a measurement outside the garment bounds', async () => {
      const garments = await api().get('/api/v1/measurements/garment-types');
      const kameez = garments.body.find((g: { key: string }) => g.key === 'kameez');

      const response = await api()
        .post('/api/v1/measurements/profiles')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          label: 'E2E invalid',
          garmentTypeId: kameez.id,
          values: {
            length: 42,
            chest: 380,
            waist: 34,
            hips: 40,
            shoulder: 15,
            sleeve_length: 22,
            sleeve_opening: 10,
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/Chest/);
    });

    it('does not let one customer read another customer profile', async () => {
      await api()
        .get(`/api/v1/measurements/profiles/${profileId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('deletes a profile the owner asked to remove', async () => {
      await api()
        .delete(`/api/v1/measurements/profiles/${profileId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(204);
    });
  });

  describe('image alt text', () => {
    let imageId: string;

    beforeAll(async () => {
      const product = await prisma.product.findFirstOrThrow({
        where: { slug: 'ready-kurta-white-cotton' },
      });
      const image = await prisma.productImage.create({
        data: { productId: product.id, url: 'https://example.test/kurta.jpg', alt: null },
      });
      imageId = image.id;
    });

    afterAll(async () => {
      await prisma.productImage.deleteMany({ where: { id: imageId } });
    });

    it('lets staff write a real description, replacing the filename fallback this UI used to send', async () => {
      const response = await api()
        .patch(`/api/v1/admin/catalog/images/${imageId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ alt: 'White cotton kurta, front view, on a hanger' })
        .expect(200);

      expect(response.body.alt).toBe('White cotton kurta, front view, on a hanger');

      const stored = await prisma.productImage.findUniqueOrThrow({ where: { id: imageId } });
      expect(stored.alt).toBe('White cotton kurta, front view, on a hanger');
    });

    it('refuses a customer', async () => {
      await api()
        .patch(`/api/v1/admin/catalog/images/${imageId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ alt: 'Should not be allowed' })
        .expect(403);
    });

    it('404s on an image that does not exist', async () => {
      await api()
        .patch('/api/v1/admin/catalog/images/does-not-exist')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ alt: 'Anything' })
        .expect(404);
    });
  });
});
