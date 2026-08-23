import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { computeStitchingFee, toMinor } from '@yaseen/shared';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/core/prisma/prisma.service';

/**
 * The cart and the stitching add-on — the flow that makes this a tailoring
 * shop rather than a clothes shop, and where a pricing bug costs real money.
 *
 * Requires a migrated, seeded database.
 */
describe('Cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let customerToken: string;

  let unstitchedVariantId: string;
  let readyVariantId: string;
  let kameezGarmentId: string;
  let kameezServiceId: string;
  let kameezServiceFee: number;
  let shalwarServiceId: string;
  let kameezProfileId: string;
  let necklineOptions: Array<{ id: string; priceDelta: number }>;
  /** Kameez has TWO required groups — neckline and sleeve style. */
  let sleeveOptionId: string;
  let finishGroupId: string;
  let liningOptionId: string;

  // Pinned below and put back in afterAll: the seed makes no promise about
  // either figure, and these tests assert on exact money and exact behaviour.
  let seededStitchingPrice = 0;
  let seededFinishAllowsText = false;

  /** The garment's own stitching fee, charged when no service product is picked. */
  const GARMENT_STITCHING_FEE = toMinor(900);

  /** A complete, in-range kameez set — what a guest types into the panel. */
  const KAMEEZ_MEASUREMENTS = {
    length: 42,
    chest: 38,
    waist: 34,
    hips: 40,
    shoulder: 15,
    sleeve_length: 22,
    sleeve_opening: 10,
  };

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

    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'ayesha@example.com', password: 'customer12345' })
      .expect(200);
    customerToken = login.body.accessToken;

    const unstitched = await prisma.product.findFirstOrThrow({
      where: { slug: 'embroidered-lawn-3-piece-ferozi' },
      include: { variants: true },
    });
    unstitchedVariantId = unstitched.variants[0]!.id;

    const ready = await prisma.product.findFirstOrThrow({
      where: { slug: 'ready-kurta-white-cotton' },
      include: { variants: true },
    });
    readyVariantId = ready.variants[0]!.id;

    const kameezService = await prisma.product.findFirstOrThrow({
      where: { slug: 'stitching-kameez-standard' },
    });
    kameezServiceId = kameezService.id;
    kameezServiceFee = kameezService.basePrice;

    const shalwarService = await prisma.product.findFirstOrThrow({
      where: { slug: 'stitching-shalwar-standard' },
    });
    shalwarServiceId = shalwarService.id;

    const kameez = await prisma.garmentType.findUniqueOrThrow({ where: { key: 'kameez' } });
    kameezGarmentId = kameez.id;
    seededStitchingPrice = kameez.stitchingPrice;
    await prisma.garmentType.update({
      where: { id: kameez.id },
      data: { stitchingPrice: GARMENT_STITCHING_FEE, stitchingEnabled: true },
    });

    kameezProfileId = (
      await prisma.measurementProfile.findFirstOrThrow({
        where: { garmentTypeId: kameez.id, user: { email: 'ayesha@example.com' } },
      })
    ).id;

    const necklineGroup = await prisma.stitchingOptionGroup.findUniqueOrThrow({
      where: { key: 'neckline' },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    necklineOptions = necklineGroup.options.map((option) => ({
      id: option.id,
      priceDelta: option.priceDelta,
    }));

    const sleeveGroup = await prisma.stitchingOptionGroup.findUniqueOrThrow({
      where: { key: 'sleeve_style' },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    sleeveOptionId = sleeveGroup.options.find((option) => option.priceDelta === 0)!.id;

    const finishGroup = await prisma.stitchingOptionGroup.findUniqueOrThrow({
      where: { key: 'kameez_finish' },
      include: { options: true },
    });
    finishGroupId = finishGroup.id;
    liningOptionId = finishGroup.options.find((option) => option.key === 'lining')!.id;

    // Finishing is the design area these tests type free text into; neckline is
    // left alone so it can stand for a group that takes no text.
    seededFinishAllowsText = finishGroup.allowCustomText;
    await prisma.stitchingOptionGroup.update({
      where: { id: finishGroup.id },
      data: { allowCustomText: true },
    });
  });

  afterAll(async () => {
    await prisma.garmentType.update({
      where: { id: kameezGarmentId },
      data: { stitchingPrice: seededStitchingPrice },
    });
    await prisma.stitchingOptionGroup.update({
      where: { id: finishGroupId },
      data: { allowCustomText: seededFinishAllowsText },
    });
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  /** A fresh guest cart, returning an agent that keeps its cookie. */
  function guest() {
    return request.agent(app.getHttpServer());
  }

  describe('guest cart', () => {
    it('starts empty and issues a token', async () => {
      const response = await api().get('/api/v1/cart').expect(200);

      expect(response.body.items).toHaveLength(0);
      expect(response.body.totals.grandTotal).toBe(0);
      expect(response.body.token).toEqual(expect.any(String));
    });

    it('adds a ready-made item and keeps it across requests', async () => {
      const agent = guest();

      const added = await agent
        .post('/api/v1/cart/items')
        .send({ variantId: readyVariantId, quantity: 2 })
        .expect(201);

      expect(added.body.items).toHaveLength(1);
      expect(added.body.itemCount).toBe(2);
      expect(added.body.totals.grandTotal).toBe(toMinor(2999) * 2);

      const reloaded = await agent.get('/api/v1/cart').expect(200);
      expect(reloaded.body.items).toHaveLength(1);
    });

    it('merges a second add of the same variant instead of stacking lines', async () => {
      const agent = guest();

      await agent.post('/api/v1/cart/items').send({ variantId: readyVariantId }).expect(201);
      const second = await agent
        .post('/api/v1/cart/items')
        .send({ variantId: readyVariantId })
        .expect(201);

      expect(second.body.items).toHaveLength(1);
      expect(second.body.items[0].quantity).toBe(2);
    });

    it('refuses more than is in stock', async () => {
      const response = await api()
        .post('/api/v1/cart/items')
        .send({ variantId: readyVariantId, quantity: 50 })
        .expect(400);

      expect(String(response.body.message)).toMatch(/left in stock|out of stock/i);
    });

    it('removes a line when the quantity is set to zero', async () => {
      const agent = guest();
      const added = await agent
        .post('/api/v1/cart/items')
        .send({ variantId: readyVariantId })
        .expect(201);

      const emptied = await agent
        .patch(`/api/v1/cart/items/${added.body.items[0].id}`)
        .send({ quantity: 0 })
        .expect(200);

      expect(emptied.body.items).toHaveLength(0);
    });
  });

  describe('stitching add-on', () => {
    // A signed-in customer has ONE cart, keyed on their account rather than on
    // the cookie — so these tests, which all sign in as the same customer,
    // would otherwise see each other's lines.
    beforeEach(async () => {
      await api()
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
    });

    it('prices fabric plus the stitching fee plus option deltas', async () => {
      const agent = guest();
      const boat = necklineOptions.find((option) => option.priceDelta > 0)!;

      const response = await agent
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          quantity: 1,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [boat.id, sleeveOptionId, liningOptionId],
          },
        })
        .expect(201);

      const line = response.body.items[0];
      const lining = toMinor(400);

      const expectedFee = computeStitchingFee({
        baseFee: kameezServiceFee,
        optionDeltas: [boat.priceDelta, 0, lining],
      });

      // The service was picked, so its price replaces the garment's own.
      expect(line.stitching.baseFee).toBe(kameezServiceFee);
      expect(line.stitching.feePerUnit).toBe(expectedFee);
      expect(line.productTotal).toBe(toMinor(4500));
      expect(line.stitchingTotal).toBe(expectedFee);
      expect(line.lineTotal).toBe(toMinor(4500) + expectedFee);
      expect(response.body.totals.grandTotal).toBe(toMinor(4500) + expectedFee);
    });

    it('multiplies the stitching fee by the quantity', async () => {
      const round = necklineOptions.find((option) => option.priceDelta === 0)!;

      const response = await guest()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          quantity: 3,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [round.id, sleeveOptionId],
          },
        })
        .expect(201);

      const line = response.body.items[0];
      expect(line.stitchingTotal).toBe(kameezServiceFee * 3);
      expect(line.lineTotal).toBe(toMinor(4500) * 3 + kameezServiceFee * 3);
    });

    it('refuses stitching on a ready-made piece', async () => {
      const round = necklineOptions[0]!;

      const response = await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: readyVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [round.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/cannot be stitched/i);
    });

    it('refuses a garment the fabric cannot be made into', async () => {
      // The kids-wear fabric allows kurta and shalwar, not kameez.
      const kidsWear = await prisma.product.findFirstOrThrow({
        where: { slug: 'kids-wash-n-wear-2-piece-grey' },
        include: { variants: true },
      });

      const response = await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: kidsWear.variants[0]!.id,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/cannot be stitched as/i);
    });

    it('refuses measurements taken for a different garment', async () => {
      const response = await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            // Shalwar service, kameez measurements.
            stitchingServiceId: shalwarServiceId,
            measurementProfileId: kameezProfileId,
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/different garment/i);
    });

    it('requires an answer for a required option group', async () => {
      const response = await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/choose a/i);
    });

    it('refuses two answers to a single-choice group', async () => {
      const response = await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [necklineOptions[0]!.id, necklineOptions[1]!.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/only one/i);
    });

    it("refuses another customer's measurement profile", async () => {
      const admin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'admin@yaseen.pk', password: 'admin12345' });

      await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${admin.body.accessToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(403);
    });

    it('refuses stitching with no measurements from either source', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/Enter the measurements/i);
    });

    it('refuses a profile and typed-in measurements at the same time', async () => {
      const response = await api()
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/not both/i);
    });
  });

  /**
   * Measurements typed straight into the panel — the path a guest takes, since
   * a saved profile needs an account and demanding one before the basket loses
   * customers.
   */
  describe('inline measurements', () => {
    // One test here signs in, and the account's single cart carries over from
    // whatever ran before it.
    beforeEach(async () => {
      await api()
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
    });

    it('lets a guest be measured without signing in', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
            sizeToken: 'M',
          },
        })
        .expect(201);

      const line = response.body.items[0];
      expect(line.stitching.measurementProfileId).toBeNull();
      expect(line.stitching.measurementValues.chest).toBe(38);
      expect(line.stitching.garmentKey).toBe('kameez');
      // Recorded for traceability only — it played no part in the measurements above.
      expect(line.stitching.sizeToken).toBe('M');
      // Nothing is outstanding: this line could be checked out as it stands.
      expect(response.body.issues).toHaveLength(0);
    });

    it('rejects a size token outside the RTW matrix', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
            sizeToken: 'XXXL',
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/sizeToken/i);
    });

    it('rejects a measurement outside the garment field bounds', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            // Chest is bounded at 60 inches.
            measurementValues: { ...KAMEEZ_MEASUREMENTS, chest: 96 },
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/chest/i);
      expect(String(response.body.message)).toMatch(/at most 60/i);
    });

    it('rejects a required measurement that was left out', async () => {
      const { chest, ...withoutChest } = KAMEEZ_MEASUREMENTS;

      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: withoutChest,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(400);

      expect(String(response.body.message)).toMatch(/chest.*required/i);
    });

    it('replaces typed-in measurements when a saved profile is attached later', async () => {
      const agent = guest();
      const added = await agent
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(201);

      const updated = await agent
        .patch(`/api/v1/cart/items/${added.body.items[0].id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ measurementProfileId: kameezProfileId })
        .expect(200);

      const line = updated.body.items[0];
      expect(line.stitching.measurementProfileId).toBe(kameezProfileId);
      // One source of measurements per line, never two that could disagree.
      expect(line.stitching.measurementValues).toBeNull();
    });
  });

  describe('pricing without a service product', () => {
    it("charges the garment's own stitching price", async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(201);

      const line = response.body.items[0];
      expect(line.stitching.serviceId).toBeNull();
      expect(line.stitching.baseFee).toBe(GARMENT_STITCHING_FEE);
      expect(line.stitching.feePerUnit).toBe(GARMENT_STITCHING_FEE);
      expect(line.lineTotal).toBe(toMinor(4500) + GARMENT_STITCHING_FEE);
    });

    it('adds the option deltas on top of the garment price', async () => {
      const boat = necklineOptions.find((option) => option.priceDelta > 0)!;

      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [boat.id, sleeveOptionId, liningOptionId],
          },
        })
        .expect(201);

      const expectedFee = computeStitchingFee({
        baseFee: GARMENT_STITCHING_FEE,
        optionDeltas: [boat.priceDelta, 0, toMinor(400)],
      });

      expect(response.body.items[0].stitching.feePerUnit).toBe(expectedFee);
    });

    it('refuses a garment that is not being stitched at the moment', async () => {
      await prisma.garmentType.update({
        where: { id: kameezGarmentId },
        data: { stitchingEnabled: false },
      });

      try {
        const response = await guest()
          .post('/api/v1/cart/items')
          .send({
            variantId: unstitchedVariantId,
            stitching: {
              garmentTypeId: kameezGarmentId,
              measurementValues: KAMEEZ_MEASUREMENTS,
              optionIds: [necklineOptions[0]!.id, sleeveOptionId],
            },
          })
          .expect(404);

        expect(String(response.body.message)).toMatch(/not being stitched/i);
      } finally {
        await prisma.garmentType.update({
          where: { id: kameezGarmentId },
          data: { stitchingEnabled: true },
        });
      }
    });
  });

  describe('custom design text', () => {
    it('keeps the words typed for a design area that takes them', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
            customDesignText: { kameez_finish: '  Contrast piping in maroon  ' },
          },
        })
        .expect(201);

      expect(response.body.items[0].stitching.customDesignText).toEqual({
        kameez_finish: 'Contrast piping in maroon',
      });
    });

    it('drops text aimed at an area with no free-text box, rather than failing', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
            customDesignText: {
              kameez_finish: 'Side slits to the knee',
              neckline: 'Something the neckline box never asked for',
            },
          },
        })
        .expect(201);

      // Only finishing survives: the neckline box was never on the form.
      expect(response.body.items[0].stitching.customDesignText).toEqual({
        kameez_finish: 'Side slits to the knee',
      });
    });

    it('caps a design note at 500 characters', async () => {
      const response = await guest()
        .post('/api/v1/cart/items')
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            garmentTypeId: kameezGarmentId,
            measurementValues: KAMEEZ_MEASUREMENTS,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
            customDesignText: { kameez_finish: 'a'.repeat(900) },
          },
        })
        .expect(201);

      expect(
        response.body.items[0].stitching.customDesignText.kameez_finish,
      ).toHaveLength(500);
    });
  });

  describe('merging a guest cart on sign-in', () => {
    it('moves the guest lines into the account rather than losing them', async () => {
      const agent = guest();
      const guestCart = await agent
        .post('/api/v1/cart/items')
        .send({ variantId: readyVariantId, quantity: 1 })
        .expect(201);

      // A second customer account, so the shared seed customer's cart is not
      // polluted by other tests in this file.
      const registered = await api()
        .post('/api/v1/auth/register')
        .send({
          email: `merge-${Date.now()}@example.com`,
          password: 'merge12345',
          firstName: 'Merge',
        })
        .expect(201);

      const merged = await api()
        .post('/api/v1/cart/merge')
        .set('Authorization', `Bearer ${registered.body.accessToken}`)
        .send({ token: guestCart.body.token })
        .expect(201);

      expect(merged.body.items).toHaveLength(1);
      expect(merged.body.items[0].variantId).toBe(readyVariantId);

      // And the emptied guest cart is gone.
      const gone = await prisma.cart.findUnique({
        where: { token: guestCart.body.token },
      });
      expect(gone).toBeNull();

      await prisma.user.delete({ where: { id: registered.body.user.id } });
    });
  });

  describe('locale', () => {
    beforeEach(async () => {
      await api()
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
    });

    it('names the garment and options in Urdu when asked', async () => {
      const agent = guest();
      await agent
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          variantId: unstitchedVariantId,
          stitching: {
            stitchingServiceId: kameezServiceId,
            measurementProfileId: kameezProfileId,
            optionIds: [necklineOptions[0]!.id, sleeveOptionId],
          },
        })
        .expect(201);

      // The line was added against the signed-in account, so the token has to
      // come along on the read too — otherwise this resolves the guest cart.
      const urdu = await agent
        .get('/api/v1/cart?locale=ur')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);
      expect(urdu.body.items[0].stitching.garmentLabel).toMatch(/[؀-ۿ]/);
      expect(urdu.body.items[0].stitching.options[0].label).toMatch(/[؀-ۿ]/);
    });
  });
});
