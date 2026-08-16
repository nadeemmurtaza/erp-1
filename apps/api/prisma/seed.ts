import { config } from 'dotenv';
import { hash } from 'bcryptjs';
import { DEFAULT_GARMENT_TYPES, slugify, toMinor } from '@yaseen/shared';
import { PrismaClient, type Prisma } from '../src/generated/prisma';

config({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient();

/**
 * Seeds a working store: staff accounts, garment types with their measurement
 * fields, stitching style options, categories, and a small catalogue of
 * stitched and unstitched products plus stitching services.
 *
 * Idempotent — every write is an upsert keyed on a stable natural key, so it is
 * safe to re-run against an existing database.
 */
async function main(): Promise<void> {
  console.warn('Seeding…');

  const users = await seedUsers();
  const garments = await seedGarmentTypes();
  await seedStitchingOptions(garments);
  const categories = await seedCategories();
  await seedProducts(categories, garments);
  await seedStitchingServices(categories, garments);
  await seedMeasurementProfiles(users.customer.id, garments);

  console.warn('Seed complete.');
  console.warn(`  Admin:    ${users.admin.email} / ${process.env.SEED_ADMIN_PASSWORD ?? 'admin12345'}`);
  console.warn(`  Staff:    ${users.staff.email} / staff12345`);
  console.warn(`  Tailor:   ${users.tailor.email} / tailor12345`);
  console.warn(`  Customer: ${users.customer.email} / customer12345`);
}

async function seedUsers() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@yaseen.pk';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      passwordHash: await hash(adminPassword, 12),
      firstName: 'Store',
      lastName: 'Admin',
      role: 'ADMIN',
      phone: '+923001110001',
    },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@yaseen.pk' },
    update: { role: 'STAFF' },
    create: {
      email: 'staff@yaseen.pk',
      passwordHash: await hash('staff12345', 12),
      firstName: 'Sana',
      lastName: 'Iqbal',
      role: 'STAFF',
      phone: '+923001110002',
    },
  });

  const tailor = await prisma.user.upsert({
    where: { email: 'tailor@yaseen.pk' },
    update: { role: 'TAILOR' },
    create: {
      email: 'tailor@yaseen.pk',
      passwordHash: await hash('tailor12345', 12),
      firstName: 'Rashid',
      lastName: 'Master',
      role: 'TAILOR',
      phone: '+923001110003',
    },
  });

  await prisma.tailorProfile.upsert({
    where: { userId: tailor.id },
    update: {},
    create: {
      userId: tailor.id,
      displayName: 'Rashid Master',
      phone: '+923001110003',
      specialties: ['kameez', 'shalwar', 'kurta'],
      capacityPerWeek: 25,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'ayesha@example.com' },
    update: {},
    create: {
      email: 'ayesha@example.com',
      passwordHash: await hash('customer12345', 12),
      firstName: 'Ayesha',
      lastName: 'Khan',
      role: 'CUSTOMER',
      phone: '+923001234567',
    },
  });

  await prisma.address.createMany({
    data: [
      {
        userId: customer.id,
        label: 'Home',
        fullName: 'Ayesha Khan',
        phone: '+923001234567',
        line1: 'House 12, Street 5',
        line2: 'DHA Phase 6',
        city: 'Karachi',
        province: 'Sindh',
        postalCode: '75500',
        isDefault: true,
      },
    ],
    skipDuplicates: true,
  });

  return { admin, staff, tailor, customer };
}

async function seedGarmentTypes() {
  const byKey = new Map<string, string>();

  for (const garment of DEFAULT_GARMENT_TYPES) {
    const record = await prisma.garmentType.upsert({
      where: { key: garment.key },
      update: { labelEn: garment.labelEn, labelUr: garment.labelUr, order: garment.order },
      create: {
        key: garment.key,
        labelEn: garment.labelEn,
        labelUr: garment.labelUr,
        order: garment.order,
      },
    });

    for (const field of garment.fields) {
      await prisma.measurementField.upsert({
        where: { garmentTypeId_key: { garmentTypeId: record.id, key: field.key } },
        update: {
          labelEn: field.labelEn,
          labelUr: field.labelUr,
          unit: field.unit,
          min: field.min,
          max: field.max,
          required: field.required,
          order: field.order,
          helpEn: field.helpEn ?? null,
          helpUr: field.helpUr ?? null,
        },
        create: {
          garmentTypeId: record.id,
          key: field.key,
          labelEn: field.labelEn,
          labelUr: field.labelUr,
          unit: field.unit,
          min: field.min,
          max: field.max,
          required: field.required,
          order: field.order,
          helpEn: field.helpEn ?? null,
          helpUr: field.helpUr ?? null,
        },
      });
    }

    byKey.set(garment.key, record.id);
  }

  return byKey;
}

async function seedStitchingOptions(garments: Map<string, string>) {
  const groups: Array<{
    key: string;
    labelEn: string;
    labelUr: string;
    garmentKey?: string;
    required?: boolean;
    selectionType?: 'SINGLE' | 'MULTI';
    order: number;
    options: Array<{ key: string; labelEn: string; labelUr: string; priceDelta: number }>;
  }> = [
    {
      key: 'neckline',
      labelEn: 'Neckline',
      labelUr: 'گلا',
      garmentKey: 'kameez',
      required: true,
      order: 1,
      options: [
        { key: 'round', labelEn: 'Round', labelUr: 'گول', priceDelta: 0 },
        { key: 'v_neck', labelEn: 'V-neck', labelUr: 'وی گلا', priceDelta: 0 },
        { key: 'boat', labelEn: 'Boat', labelUr: 'بوٹ', priceDelta: toMinor(150) },
        {
          key: 'square',
          labelEn: 'Square',
          labelUr: 'اسکوائر',
          priceDelta: toMinor(150),
        },
      ],
    },
    {
      key: 'sleeve_style',
      labelEn: 'Sleeve style',
      labelUr: 'آستین',
      garmentKey: 'kameez',
      required: true,
      order: 2,
      options: [
        { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
        { key: 'bell', labelEn: 'Bell', labelUr: 'بیل', priceDelta: toMinor(250) },
        {
          key: 'cuffed',
          labelEn: 'Cuffed',
          labelUr: 'کف والی',
          priceDelta: toMinor(200),
        },
        {
          key: 'sleeveless',
          labelEn: 'Sleeveless',
          labelUr: 'بغیر آستین',
          priceDelta: toMinor(-150),
        },
      ],
    },
    {
      key: 'kameez_finish',
      labelEn: 'Finishing',
      labelUr: 'فنشنگ',
      garmentKey: 'kameez',
      selectionType: 'MULTI',
      order: 3,
      options: [
        { key: 'lining', labelEn: 'Full lining', labelUr: 'مکمل استر', priceDelta: toMinor(400) },
        { key: 'piping', labelEn: 'Piping', labelUr: 'پائپنگ', priceDelta: toMinor(200) },
        {
          key: 'side_slits',
          labelEn: 'Side slits',
          labelUr: 'سائیڈ چاک',
          priceDelta: toMinor(100),
        },
      ],
    },
    {
      key: 'trouser_cut',
      labelEn: 'Trouser cut',
      labelUr: 'ٹراؤزر کٹ',
      garmentKey: 'trouser',
      required: true,
      order: 1,
      options: [
        { key: 'straight', labelEn: 'Straight', labelUr: 'سیدھا', priceDelta: 0 },
        { key: 'cigarette', labelEn: 'Cigarette', labelUr: 'سگریٹ', priceDelta: toMinor(150) },
        { key: 'bootcut', labelEn: 'Bootcut', labelUr: 'بوٹ کٹ', priceDelta: toMinor(200) },
        { key: 'palazzo', labelEn: 'Palazzo', labelUr: 'پلازو', priceDelta: toMinor(250) },
      ],
    },
    {
      key: 'shalwar_style',
      labelEn: 'Shalwar style',
      labelUr: 'شلوار اسٹائل',
      garmentKey: 'shalwar',
      required: true,
      order: 1,
      options: [
        { key: 'classic', labelEn: 'Classic', labelUr: 'کلاسک', priceDelta: 0 },
        { key: 'tulip', labelEn: 'Tulip', labelUr: 'ٹیولپ', priceDelta: toMinor(300) },
        { key: 'dhoti', labelEn: 'Dhoti', labelUr: 'دھوتی', priceDelta: toMinor(350) },
      ],
    },
  ];

  for (const group of groups) {
    const record = await prisma.stitchingOptionGroup.upsert({
      where: { key: group.key },
      update: {
        labelEn: group.labelEn,
        labelUr: group.labelUr,
        required: group.required ?? false,
        selectionType: group.selectionType ?? 'SINGLE',
        order: group.order,
        garmentTypeId: group.garmentKey ? (garments.get(group.garmentKey) ?? null) : null,
      },
      create: {
        key: group.key,
        labelEn: group.labelEn,
        labelUr: group.labelUr,
        required: group.required ?? false,
        selectionType: group.selectionType ?? 'SINGLE',
        order: group.order,
        garmentTypeId: group.garmentKey ? (garments.get(group.garmentKey) ?? null) : null,
      },
    });

    for (const [index, option] of group.options.entries()) {
      await prisma.stitchingOption.upsert({
        where: { groupId_key: { groupId: record.id, key: option.key } },
        update: {
          labelEn: option.labelEn,
          labelUr: option.labelUr,
          priceDelta: option.priceDelta,
          order: index,
        },
        create: {
          groupId: record.id,
          key: option.key,
          labelEn: option.labelEn,
          labelUr: option.labelUr,
          priceDelta: option.priceDelta,
          order: index,
        },
      });
    }
  }
}

async function seedCategories() {
  const definitions = [
    { slug: 'unstitched', en: 'Unstitched', ur: 'اَن سلا', order: 1 },
    { slug: 'ready-to-wear', en: 'Ready to Wear', ur: 'سلا ہوا', order: 2 },
    { slug: 'stitching-services', en: 'Stitching Services', ur: 'سلائی سروسز', order: 3 },
    { slug: 'menswear', en: 'Menswear', ur: 'مردانہ', order: 4 },
  ];

  const byslug = new Map<string, string>();

  for (const definition of definitions) {
    const category = await prisma.category.upsert({
      where: { slug: definition.slug },
      update: { order: definition.order },
      create: { slug: definition.slug, order: definition.order },
    });

    for (const [locale, name] of [
      ['en', definition.en],
      ['ur', definition.ur],
    ] as const) {
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale } },
        update: { name },
        create: { categoryId: category.id, locale, name },
      });
    }

    byslug.set(definition.slug, category.id);
  }

  return byslug;
}

interface SeedProduct {
  slug: string;
  kind: 'STITCHED' | 'UNSTITCHED';
  categorySlug: string;
  nameEn: string;
  nameUr: string;
  descriptionEn: string;
  descriptionUr: string;
  priceRupees: number;
  compareAtRupees?: number;
  fabric: string;
  season: string;
  tags: string[];
  pieceCount?: number;
  fabricMeters?: number;
  stitchingAvailable?: boolean;
  garmentKeys?: string[];
  featuredRank?: number;
  variants: Array<{ size?: string; color: string; colorHex: string; stock: number }>;
}

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'embroidered-lawn-3-piece-ferozi',
    kind: 'UNSTITCHED',
    categorySlug: 'unstitched',
    nameEn: '3-Piece Embroidered Lawn Suit — Ferozi',
    nameUr: 'تھری پیس کڑھائی والا لان سوٹ — فیروزی',
    descriptionEn:
      'Embroidered lawn front with printed back and sleeves, cambric trouser and a chiffon dupatta. Cut generously so it can be stitched to any style.',
    descriptionUr:
      'کڑھائی والا لان فرنٹ، پرنٹڈ بیک اور آستین، کیمبرک ٹراؤزر اور شیفون دوپٹہ۔',
    priceRupees: 4500,
    compareAtRupees: 5500,
    fabric: 'lawn',
    season: 'summer',
    tags: ['embroidered', 'summer', 'festive'],
    pieceCount: 3,
    fabricMeters: 9.5,
    stitchingAvailable: true,
    garmentKeys: ['kameez', 'shalwar', 'trouser'],
    featuredRank: 100,
    variants: [{ size: 'Free size', color: 'Ferozi', colorHex: '#2e8b9a', stock: 25 }],
  },
  {
    slug: 'printed-lawn-2-piece-rose',
    kind: 'UNSTITCHED',
    categorySlug: 'unstitched',
    nameEn: '2-Piece Printed Lawn — Rose',
    nameUr: 'ٹو پیس پرنٹڈ لان — گلابی',
    descriptionEn:
      'Everyday printed lawn shirt and trouser fabric. Colour-fast and light enough for Karachi summers.',
    descriptionUr: 'روزمرہ کے لیے پرنٹڈ لان شرٹ اور ٹراؤزر کا کپڑا۔',
    priceRupees: 2800,
    fabric: 'lawn',
    season: 'summer',
    tags: ['printed', 'everyday'],
    pieceCount: 2,
    fabricMeters: 6.5,
    stitchingAvailable: true,
    garmentKeys: ['kameez', 'trouser'],
    featuredRank: 60,
    variants: [{ size: 'Free size', color: 'Rose', colorHex: '#c96a83', stock: 40 }],
  },
  {
    slug: 'khaddar-3-piece-winter-olive',
    kind: 'UNSTITCHED',
    categorySlug: 'unstitched',
    nameEn: '3-Piece Khaddar Winter Suit — Olive',
    nameUr: 'تھری پیس کھدر ونٹر سوٹ — زیتونی',
    descriptionEn:
      'Warm khaddar shirt and trouser with a woollen shawl. Suited to Lahore and Islamabad winters.',
    descriptionUr: 'گرم کھدر شرٹ اور ٹراؤزر کے ساتھ اونی شال۔',
    priceRupees: 5200,
    fabric: 'khaddar',
    season: 'winter',
    tags: ['winter', 'warm'],
    pieceCount: 3,
    fabricMeters: 10,
    stitchingAvailable: true,
    garmentKeys: ['kameez', 'shalwar'],
    featuredRank: 70,
    variants: [{ size: 'Free size', color: 'Olive', colorHex: '#6b7d4a', stock: 18 }],
  },
  {
    slug: 'ready-kurta-white-cotton',
    kind: 'STITCHED',
    categorySlug: 'ready-to-wear',
    nameEn: 'Ready-to-Wear Cotton Kurta — White',
    nameUr: 'تیار سوتی کرتا — سفید',
    descriptionEn:
      'A plain white cotton kurta, straight cut with side slits. Machine washable.',
    descriptionUr: 'سادہ سفید سوتی کرتا، سیدھا کٹ اور سائیڈ چاک کے ساتھ۔',
    priceRupees: 2999,
    compareAtRupees: 3499,
    fabric: 'cotton',
    season: 'summer',
    tags: ['ready', 'basic'],
    featuredRank: 80,
    variants: [
      { size: 'S', color: 'White', colorHex: '#f7f7f2', stock: 12 },
      { size: 'M', color: 'White', colorHex: '#f7f7f2', stock: 20 },
      { size: 'L', color: 'White', colorHex: '#f7f7f2', stock: 15 },
      { size: 'XL', color: 'White', colorHex: '#f7f7f2', stock: 8 },
    ],
  },
  {
    slug: 'ready-chiffon-formal-maroon',
    kind: 'STITCHED',
    categorySlug: 'ready-to-wear',
    nameEn: 'Stitched Chiffon Formal — Maroon',
    nameUr: 'سلا ہوا شیفون فارمل — مرون',
    descriptionEn:
      'Fully stitched chiffon formal with hand-embellished neckline and a matching slip.',
    descriptionUr: 'مکمل سلا ہوا شیفون فارمل، ہاتھ کی کڑھائی والے گلے کے ساتھ۔',
    priceRupees: 12500,
    fabric: 'chiffon',
    season: 'festive',
    tags: ['formal', 'wedding', 'festive'],
    featuredRank: 90,
    variants: [
      { size: 'S', color: 'Maroon', colorHex: '#7b2233', stock: 4 },
      { size: 'M', color: 'Maroon', colorHex: '#7b2233', stock: 6 },
      { size: 'L', color: 'Maroon', colorHex: '#7b2233', stock: 3 },
    ],
  },
  {
    slug: 'mens-wash-n-wear-2-piece-grey',
    kind: 'UNSTITCHED',
    categorySlug: 'menswear',
    nameEn: "Men's Wash & Wear 2-Piece — Grey",
    nameUr: 'مردانہ واش اینڈ ویئر ٹو پیس — سرمئی',
    descriptionEn:
      'Classic wash & wear shalwar kameez fabric. Needs no ironing after a wash.',
    descriptionUr: 'کلاسک واش اینڈ ویئر شلوار قمیض کا کپڑا۔',
    priceRupees: 3200,
    fabric: 'wash-n-wear',
    season: 'all-season',
    tags: ['menswear', 'formal'],
    pieceCount: 2,
    fabricMeters: 7,
    stitchingAvailable: true,
    garmentKeys: ['kurta', 'shalwar'],
    featuredRank: 50,
    variants: [{ size: 'Free size', color: 'Grey', colorHex: '#6d6f74', stock: 30 }],
  },
];

async function seedProducts(categories: Map<string, string>, garments: Map<string, string>) {
  for (const definition of PRODUCTS) {
    const categoryId = categories.get(definition.categorySlug);

    const product = await prisma.product.upsert({
      where: { slug: definition.slug },
      update: {
        status: 'ACTIVE',
        basePrice: toMinor(definition.priceRupees),
        featuredRank: definition.featuredRank ?? 0,
      },
      create: {
        slug: definition.slug,
        kind: definition.kind,
        status: 'ACTIVE',
        categoryId,
        basePrice: toMinor(definition.priceRupees),
        compareAtPrice: definition.compareAtRupees
          ? toMinor(definition.compareAtRupees)
          : null,
        brand: 'Yaseen',
        fabric: definition.fabric,
        season: definition.season,
        tags: definition.tags,
        pieceCount: definition.pieceCount ?? null,
        fabricMeters: definition.fabricMeters ?? null,
        stitchingAvailable: definition.stitchingAvailable ?? false,
        featuredRank: definition.featuredRank ?? 0,
        publishedAt: new Date(),
      },
    });

    for (const [locale, name, description] of [
      ['en', definition.nameEn, definition.descriptionEn],
      ['ur', definition.nameUr, definition.descriptionUr],
    ] as const) {
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale } },
        update: { name, description },
        create: { productId: product.id, locale, name, description },
      });
    }

    for (const [index, variant] of definition.variants.entries()) {
      const sku = buildSku(definition.slug, variant.color, variant.size);
      await prisma.productVariant.upsert({
        where: { sku },
        update: { stock: variant.stock },
        create: {
          productId: product.id,
          sku,
          size: variant.size ?? null,
          color: variant.color,
          colorHex: variant.colorHex,
          stock: variant.stock,
          order: index,
        },
      });
    }

    for (const garmentKey of definition.garmentKeys ?? []) {
      const garmentTypeId = garments.get(garmentKey);
      if (!garmentTypeId) continue;
      await prisma.productGarmentType.upsert({
        where: { productId_garmentTypeId: { productId: product.id, garmentTypeId } },
        update: {},
        create: { productId: product.id, garmentTypeId },
      });
    }
  }
}

async function seedStitchingServices(
  categories: Map<string, string>,
  garments: Map<string, string>,
) {
  const services: Array<{
    slug: string;
    garmentKey: string;
    nameEn: string;
    nameUr: string;
    descriptionEn: string;
    descriptionUr: string;
    feeRupees: number;
  }> = [
    {
      slug: 'stitching-kameez-standard',
      garmentKey: 'kameez',
      nameEn: 'Kameez Stitching — Standard',
      nameUr: 'قمیض سلائی — اسٹینڈرڈ',
      descriptionEn: 'Machine-stitched kameez to your measurements. Ready in 7 working days.',
      descriptionUr: 'آپ کے ناپ کے مطابق مشین سلائی۔ سات کام کے دنوں میں تیار۔',
      feeRupees: 1200,
    },
    {
      slug: 'stitching-kameez-premium',
      garmentKey: 'kameez',
      nameEn: 'Kameez Stitching — Premium',
      nameUr: 'قمیض سلائی — پریمیم',
      descriptionEn:
        'Hand-finished seams, full lining and a fitting check before dispatch. Ready in 10 working days.',
      descriptionUr:
        'ہاتھ کی فنشنگ، مکمل استر اور روانگی سے پہلے فٹنگ چیک۔ دس کام کے دنوں میں تیار۔',
      feeRupees: 2500,
    },
    {
      slug: 'stitching-shalwar-standard',
      garmentKey: 'shalwar',
      nameEn: 'Shalwar Stitching',
      nameUr: 'شلوار سلائی',
      descriptionEn: 'Shalwar stitched to your measurements in your chosen style.',
      descriptionUr: 'آپ کے ناپ اور پسندیدہ اسٹائل میں شلوار کی سلائی۔',
      feeRupees: 700,
    },
    {
      slug: 'stitching-trouser-standard',
      garmentKey: 'trouser',
      nameEn: 'Trouser Stitching',
      nameUr: 'ٹراؤزر سلائی',
      descriptionEn: 'Trouser stitched to your measurements — straight, cigarette or palazzo.',
      descriptionUr: 'آپ کے ناپ کے مطابق ٹراؤزر کی سلائی۔',
      feeRupees: 800,
    },
    {
      slug: 'stitching-kurta-mens',
      garmentKey: 'kurta',
      nameEn: "Men's Kurta Stitching",
      nameUr: 'مردانہ کرتا سلائی',
      descriptionEn: "Men's kurta stitched to measure with a collar or band neck.",
      descriptionUr: 'مردانہ کرتا، کالر یا بینڈ گلے کے ساتھ، ناپ کے مطابق۔',
      feeRupees: 1500,
    },
  ];

  const categoryId = categories.get('stitching-services');

  for (const service of services) {
    const garmentTypeId = garments.get(service.garmentKey);
    if (!garmentTypeId) continue;

    const product = await prisma.product.upsert({
      where: { slug: service.slug },
      update: { basePrice: toMinor(service.feeRupees), status: 'ACTIVE', garmentTypeId },
      create: {
        slug: service.slug,
        kind: 'STITCHING_SERVICE',
        status: 'ACTIVE',
        categoryId,
        basePrice: toMinor(service.feeRupees),
        garmentTypeId,
        publishedAt: new Date(),
      },
    });

    for (const [locale, name, description] of [
      ['en', service.nameEn, service.descriptionEn],
      ['ur', service.nameUr, service.descriptionUr],
    ] as const) {
      await prisma.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale } },
        update: { name, description },
        create: { productId: product.id, locale, name, description },
      });
    }

    // A service still needs a variant so it can be added to a cart.
    const sku = `SVC-${service.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}`;
    await prisma.productVariant.upsert({
      where: { sku },
      update: {},
      create: { productId: product.id, sku, size: null, color: null, stock: 9999 },
    });
  }
}

async function seedMeasurementProfiles(userId: string, garments: Map<string, string>) {
  const kameezId = garments.get('kameez');
  const shalwarId = garments.get('shalwar');
  if (!kameezId || !shalwarId) return;

  const profiles: Array<{ garmentTypeId: string; label: string; values: Prisma.InputJsonValue }> = [
    {
      garmentTypeId: kameezId,
      label: 'Self',
      values: {
        length: 42,
        chest: 38,
        waist: 34,
        hips: 40,
        shoulder: 15,
        sleeve_length: 22,
        sleeve_opening: 10,
      },
    },
    {
      garmentTypeId: shalwarId,
      label: 'Self',
      values: { length: 40, waist: 34, hips: 42, bottom: 14 },
    },
  ];

  for (const profile of profiles) {
    await prisma.measurementProfile.upsert({
      where: {
        userId_garmentTypeId_label: {
          userId,
          garmentTypeId: profile.garmentTypeId,
          label: profile.label,
        },
      },
      update: { values: profile.values },
      create: {
        userId,
        garmentTypeId: profile.garmentTypeId,
        label: profile.label,
        values: profile.values,
        isDefault: true,
      },
    });
  }
}

function buildSku(slug: string, color: string, size?: string): string {
  const parts = [slug, color, size].filter(Boolean).map((part) => slugify(String(part)));
  return parts.join('-').toUpperCase().slice(0, 60);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
