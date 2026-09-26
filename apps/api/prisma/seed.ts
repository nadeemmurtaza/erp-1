import { config } from 'dotenv';
import { hash } from 'bcryptjs';
import {
  DEFAULT_GARMENT_TYPES,
  DEFAULT_LOCALE,
  PERMISSION_CATALOG,
  ROLE_PERMISSION_SEED,
  slugify,
  toMinor,
  type PermissionKey,
} from '@newax/shared';
import { PrismaClient, type Prisma, type UserRole } from '../src/generated/prisma';

config({ path: ['.env', '../../.env'], quiet: true });

import { EventBusService } from '../src/core/events/event-bus.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../src/core/audit/audit.service';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import { StockIntakeRegistry } from '../src/core/extension-points/stock-intake.registry';
import { EntityEnrichmentRegistry } from '../src/core/extension-points/entity-enrichment.registry';
import { IntentRouterService } from '../src/core/intent/intent-router.service';
import { CHART_OF_ACCOUNTS } from '../src/modules/accounting/chart-of-accounts';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const eventBus = new EventBusService(prismaService, new EventEmitter2());
const audit = new AuditService(prismaService);
const inventoryService = new InventoryService(
  prismaService,
  audit,
  eventBus,
  new StockIntakeRegistry(),
  new EntityEnrichmentRegistry(),
  new IntentRouterService(),
);

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

  await seedPermissions();
  const users = await seedUsers();
  await seedRoles();
  await seedChartOfAccounts();
  await seedExpenseCategories();
  await seedReturnReasons();
  const garments = await seedGarmentTypes();
  await seedGarmentCatalogExpansion(garments);
  await seedStitchingOptions(garments);
  await retireOldOptionGroups();
  const categories = await seedCategories();
  await seedRawMaterialCategory();
  const locationId = await inventoryService.defaultLocationId();
  await seedProducts(categories, garments, locationId);
  await seedStitchingServices(categories, garments, locationId);
  await seedMeasurementProfiles(users.customer.id, garments);
  await seedWorkshopQueue(users.tailor.id, garments);

  console.warn('Seed complete.');
  console.warn(`  Admin:    ${users.admin.email} / ${process.env.SEED_ADMIN_PASSWORD ?? 'admin12345'}`);
  console.warn(`  Staff:    ${users.staff.email} / staff12345`);
  console.warn(`  Tailor:   ${users.tailor.email} / tailor12345`);
  console.warn(`  Customer: ${users.customer.email} / customer12345`);
}

/**
 * Loads the permission catalog and, for any permission that has never been
 * granted to anyone, applies its default role grants from
 * ROLE_PERMISSION_SEED (@newax/shared).
 *
 * The label/category upsert always runs — that's just display metadata. The
 * grant step deliberately does not: once a permission has at least one
 * RolePermission row, an admin may have edited it from /admin/settings, so a
 * later seed run must never add or remove a grant on top of that. Only a
 * brand-new permission — one this run's upsert just created for the first
 * time — has zero existing grants and picks up its defaults here.
 */
async function seedPermissions(): Promise<void> {
  const permissionIds = new Map<string, string>();

  for (const def of PERMISSION_CATALOG) {
    const record = await prisma.permission.upsert({
      where: { key: def.key },
      update: { label: def.label, category: def.category },
      create: { key: def.key, label: def.label, category: def.category },
    });
    permissionIds.set(def.key, record.id);
  }

  const alreadyManaged = new Set(
    (await prisma.rolePermission.findMany({ select: { permissionId: true } })).map(
      (row) => row.permissionId,
    ),
  );

  for (const [role, keys] of Object.entries(ROLE_PERMISSION_SEED) as Array<
    [UserRole, readonly PermissionKey[]]
  >) {
    for (const key of keys) {
      const permissionId = permissionIds.get(key);
      if (!permissionId || alreadyManaged.has(permissionId)) continue;

      await prisma.rolePermission.create({ data: { role, permissionId } });
    }
  }
}

/**
 * One-time bootstrap of the custom-roles system onto the old fixed-enum
 * one: creates a real `Role` row for each of the four `UserRole` enum
 * values, copies each one's *current* `RolePermission` grants (not the
 * static `ROLE_PERMISSION_SEED` constant — a deployment may have hand-edited
 * these from /admin/settings already, and the backfill must carry that
 * forward, not reset it), and assigns every existing user the `Role`
 * matching their current `role` column.
 *
 * Strictly one-time: if any `Role` row already exists — from this having
 * run before, or from a super admin having created a custom role since —
 * this returns immediately and touches nothing. There is no "re-sync"
 * step, on purpose: once roles are real, editable rows, a later seed run
 * asserting anything about them would fight whatever an admin has since
 * done, the same reasoning `seedPermissions()` already applies to grants.
 */
async function seedRoles(): Promise<void> {
  const alreadySeeded = await prisma.role.count();
  if (alreadySeeded > 0) return;

  console.warn('Seeding roles (one-time: migrating the fixed role enum into real Role rows)…');

  const ROLE_DISPLAY: Record<UserRole, { name: string; description: string }> = {
    CUSTOMER: { name: 'Customer', description: 'A storefront shopper — the default for every signup.' },
    TAILOR: { name: 'Tailor', description: 'Works the stitching queue.' },
    STAFF: { name: 'Staff', description: 'Day-to-day back-office operations.' },
    ADMIN: { name: 'Admin', description: 'Full back-office access, including settings and permissions.' },
  };

  const roleIdByEnum = new Map<UserRole, string>();

  for (const enumRole of Object.keys(ROLE_DISPLAY) as UserRole[]) {
    const { name, description } = ROLE_DISPLAY[enumRole];
    const role = await prisma.role.create({ data: { name, description } });
    roleIdByEnum.set(enumRole, role.id);

    const currentGrants = await prisma.rolePermission.findMany({ where: { role: enumRole } });
    if (currentGrants.length > 0) {
      await prisma.roleGrant.createMany({
        data: currentGrants.map((grant) => ({ roleId: role.id, permissionId: grant.permissionId })),
        skipDuplicates: true,
      });
    }
  }

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  if (users.length > 0) {
    await prisma.userRoleAssignment.createMany({
      data: users.map((user) => ({ userId: user.id, roleId: roleIdByEnum.get(user.role)! })),
      skipDuplicates: true,
    });
  }

  console.warn(`  Migrated ${users.length} user(s) onto the new Role system.`);
}

/**
 * Seeds the accounts the posting rules (WO-19.2) and the year-end close
 * (WO-19.5) resolve by code —
 * `chart-of-accounts.ts`'s `CHART_OF_ACCOUNTS`. Runs unconditionally, the
 * same as every other reference-data seed here, even when `accounting` is
 * off in MODULES: the rows are inert until a posting rule looks one up, and
 * seeding them only on toggle-on would mean the first sale after turning
 * accounting on has nothing to post to.
 *
 * Only `name` is re-asserted on a re-run — never `type`/`isBank`/`isControl`,
 * which are structural and, once an accounts-admin screen exists, editable —
 * the same "label always upserts, structure never gets reset" split
 * `seedPermissions()` already uses for grants.
 */
async function seedChartOfAccounts(): Promise<void> {
  for (const account of CHART_OF_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: { name: account.name },
      create: account,
    });
  }
}

/**
 * WO-23.1 — categories are seed data, not a setting (staff edit them as
 * rows from the admin UI once seeded). `isDirect: true` on exactly
 * packaging/courier_charges/gateway_fees: they scale with orders and sit
 * above the gross-profit line with COGS, everything else sits below it.
 * Upsert on `key` keeps ids stable across re-runs.
 */
async function seedExpenseCategories(): Promise<void> {
  const categories: Array<{ key: string; name: string; isDirect: boolean; order: number }> = [
    { key: 'rent', name: 'Rent', isDirect: false, order: 0 },
    { key: 'salaries', name: 'Salaries', isDirect: false, order: 1 },
    { key: 'utilities', name: 'Utilities', isDirect: false, order: 2 },
    { key: 'marketing', name: 'Marketing', isDirect: false, order: 3 },
    { key: 'transport', name: 'Transport', isDirect: false, order: 4 },
    { key: 'packaging', name: 'Packaging', isDirect: true, order: 5 },
    { key: 'courier_charges', name: 'Courier charges', isDirect: true, order: 6 },
    { key: 'gateway_fees', name: 'Payment gateway fees', isDirect: true, order: 7 },
    { key: 'equipment_rent', name: 'Equipment rent', isDirect: false, order: 8 },
    { key: 'repairs', name: 'Repairs', isDirect: false, order: 9 },
    { key: 'misc', name: 'Miscellaneous', isDirect: false, order: 10 },
  ];

  for (const category of categories) {
    await prisma.expenseCategory.upsert({
      where: { key: category.key },
      update: { name: category.name, isDirect: category.isDirect, order: category.order },
      create: category,
    });
  }
}

/**
 * WO-6.6 — "reason codes are a seeded, editable list, not free text: they
 * are the input to the fit-feedback loop in Phase 9." Upsert on `key` keeps
 * ids stable across re-runs, same idiom as seedExpenseCategories() above.
 */
async function seedReturnReasons(): Promise<void> {
  const reasons: Array<{ key: string; order: number; labelEn: string; labelUr: string }> = [
    { key: 'too_small', order: 0, labelEn: 'Too small', labelUr: 'زیادہ چھوٹا' },
    { key: 'too_big', order: 1, labelEn: 'Too big', labelUr: 'زیادہ بڑا' },
    { key: 'damaged', order: 2, labelEn: 'Arrived damaged', labelUr: 'خراب حالت میں پہنچا' },
    { key: 'not_as_described', order: 3, labelEn: 'Not as described', labelUr: 'تفصیل سے مطابقت نہیں رکھتا' },
    { key: 'wrong_item', order: 4, labelEn: 'Wrong item received', labelUr: 'غلط آئٹم موصول ہوا' },
    { key: 'quality_issue', order: 5, labelEn: 'Quality issue', labelUr: 'معیار کا مسئلہ' },
    { key: 'changed_mind', order: 6, labelEn: 'Changed my mind', labelUr: 'ارادہ بدل گیا' },
    { key: 'late_delivery', order: 7, labelEn: 'Arrived too late', labelUr: 'دیر سے پہنچا' },
    { key: 'other', order: 8, labelEn: 'Other', labelUr: 'دیگر' },
  ];

  for (const reason of reasons) {
    const record = await prisma.returnReasonCode.upsert({
      where: { key: reason.key },
      update: { order: reason.order },
      create: { key: reason.key, order: reason.order },
    });
    for (const [locale, label] of [
      ['en', reason.labelEn],
      ['ur', reason.labelUr],
    ] as const) {
      await prisma.returnReasonTranslation.upsert({
        where: { reasonId_locale: { reasonId: record.id, locale } },
        update: { label },
        create: { reasonId: record.id, locale, label },
      });
    }
  }
}

/**
 * Upserts a seeded user by EITHER its email or its phone.
 *
 * Both columns are unique, and the seed hard-codes a phone per role. Keying
 * only on email meant that renaming a seeded account — `staff@yaseen.pk` to a
 * real person's address, say — made the seed look for an email that no longer
 * exists, try to CREATE the user, and collide on a phone the renamed row
 * still holds:
 *
 *   Unique constraint failed on the fields: (`phone`)
 *
 * That is not recoverable by re-running, and it aborts the whole seed, so
 * every later step (reference data, and on a fresh database the permission
 * catalog) never runs.
 *
 * Matching on either identifier makes it idempotent against a database whose
 * accounts have since been edited. An existing row keeps its email, phone,
 * name and password — only `role` is asserted, which is the one thing the
 * seed is responsible for. Nothing here ever resets a live user's password.
 */
async function upsertSeedUser(input: {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'STAFF' | 'TAILOR' | 'CUSTOMER';
  /** CUSTOMER is left alone if it already exists; staff roles are asserted. */
  assertRole?: boolean;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
  });

  if (existing) {
    if (!input.assertRole || existing.role === input.role) return existing;
    return prisma.user.update({
      where: { id: existing.id },
      data: { role: input.role },
    });
  }

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hash(input.password, 12),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      phone: input.phone,
    },
  });
}

async function seedUsers() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@yaseen.pk';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

  const admin = await upsertSeedUser({
    email: adminEmail,
    phone: '+923001110001',
    password: adminPassword,
    firstName: 'Store',
    lastName: 'Admin',
    role: 'ADMIN',
    assertRole: true,
  });

  const staff = await upsertSeedUser({
    email: 'staff@yaseen.pk',
    phone: '+923001110002',
    password: 'staff12345',
    firstName: 'Sana',
    lastName: 'Iqbal',
    role: 'STAFF',
    assertRole: true,
  });

  const tailor = await upsertSeedUser({
    email: 'tailor@yaseen.pk',
    phone: '+923001110003',
    password: 'tailor12345',
    firstName: 'Rashid',
    lastName: 'Master',
    role: 'TAILOR',
    assertRole: true,
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

  const customer = await upsertSeedUser({
    email: 'ayesha@example.com',
    phone: '+923001234567',
    password: 'customer12345',
    firstName: 'Ayesha',
    lastName: 'Khan',
    role: 'CUSTOMER',
    // Demo customer: if a real account already holds this address or number,
    // leave its role alone rather than demoting somebody to CUSTOMER.
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

/**
 * Base stitching fee per garment, in rupees. The garment list IS the price
 * list — a STITCHING_SERVICE product only overrides it when the customer picks
 * one, so these have to stand on their own in a shop that sells no service SKUs.
 *
 * A suit is billed as its parts (kameez + shalwar = Rs 1,800), which is how the
 * stitching panel adds it up, so there is no separate "suit" garment. Garments
 * missing from this map are seeded with stitching switched off.
 */
const STITCHING_PRICES: Record<string, number> = {
  kameez: 1200,
  shalwar: 600,
  trouser: 700,
  kurta: 1400,
  waistcoat: 1800,
  blouse: 900,
};

async function seedGarmentTypes() {
  const byKey = new Map<string, string>();

  for (const garment of DEFAULT_GARMENT_TYPES) {
    // Written on update as well as create, so a database seeded before the
    // garment carried a price picks it up instead of quoting stitching at zero.
    const stitchingPrice = toMinor(STITCHING_PRICES[garment.key] ?? 0);
    const stitchingEnabled = garment.key in STITCHING_PRICES;

    const record = await prisma.garmentType.upsert({
      where: { key: garment.key },
      update: {
        labelEn: garment.labelEn,
        labelUr: garment.labelUr,
        order: garment.order,
        stitchingPrice,
        stitchingEnabled,
      },
      create: {
        key: garment.key,
        labelEn: garment.labelEn,
        labelUr: garment.labelUr,
        order: garment.order,
        stitchingPrice,
        stitchingEnabled,
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

/**
 * Garments the tech-pack adds beyond the starter set in
 * packages/shared/src/measurements/defaults.ts. Kept here rather than in the
 * shared package because every one of these carries the aliasesEn/aliasesUr/
 * baseFabricGaz columns the original five don't need to expose to any other
 * caller — a new garment is only ever seeded once.
 *
 * Fields measure in inches. A garment only picks up what a tape measure can
 * record — styling choices the tech-pack lists alongside them ("sleeve
 * profile", "side slit type", "cuff style") are stitching options
 * (STITCHING_OPTION_GROUPS below), not measurements.
 */
interface SeedGarmentField {
  key: string;
  labelEn: string;
  labelUr: string;
  min: number;
  max: number;
  required: boolean;
  order: number;
  helpEn?: string;
  helpUr?: string;
}

/**
 * The four tech-pack garments that map onto keys seedGarmentTypes() already
 * created (kameez, blouse, shalwar, trouser). labelEn/labelUr/order/
 * stitchingPrice already exist on those rows and are left alone — only the
 * columns and fields this record is still missing are written here.
 */
const GARMENT_EXTENSIONS: Array<{
  key: string;
  aliasesEn: string[];
  aliasesUr: string[];
  baseFabricGaz: number;
  fields: SeedGarmentField[];
}> = [
  {
    // Straight Kameez — Straight Kurta, Qameez, Long Shirt.
    key: 'kameez',
    aliasesEn: ['Straight Kurta', 'Qameez', 'Long Shirt'],
    aliasesUr: ['سٹریٹ کرتا', 'قمیض', 'لمبی شرٹ'],
    baseFabricGaz: 2.5,
    fields: [
      {
        key: 'slit_height',
        labelEn: 'Slit height',
        labelUr: 'چاک کی اونچائی',
        min: 0.25,
        max: 20,
        required: false,
        order: 11,
        helpEn: 'How high the side slit is cut, measured up from the hem.',
        helpUr: 'سائیڈ چاک دامن سے کتنی اونچائی تک کاٹا جائے۔',
      },
      {
        key: 'daman',
        labelEn: 'Daman (hem width)',
        labelUr: 'دامن کی چوڑائی',
        min: 20,
        max: 80,
        required: false,
        order: 12,
        helpEn: 'Width of the bottom hem, for a flared cut.',
        helpUr: 'نچلے دامن کی چوڑائی، فلیئرڈ کٹ کے لیے۔',
      },
    ],
  },
  {
    // Festive Crop Blouse — Choli, Saree Blouse, Katori Blouse.
    key: 'blouse',
    aliasesEn: ['Choli', 'Saree Blouse', 'Katori Blouse'],
    aliasesUr: ['چولی', 'ساڑھی بلاؤز', 'کٹوری بلاؤز'],
    baseFabricGaz: 1.25,
    fields: [
      {
        key: 'upper_bust',
        labelEn: 'Upper bust',
        labelUr: 'اپر بسٹ',
        min: 24,
        max: 56,
        required: false,
        order: 8,
        helpEn: 'Around the chest just above the bust line.',
        helpUr: 'بسٹ لائن سے تھوڑا اوپر، سینے کے گرد۔',
      },
      {
        key: 'apex_point',
        labelEn: 'Apex point (shoulder to bust point)',
        labelUr: 'شانے سے بسٹ پوائنٹ تک',
        min: 6,
        max: 16,
        required: false,
        order: 9,
        helpEn: 'From the shoulder seam down to the fullest point of the bust.',
        helpUr: 'شانے کی سلائی سے بسٹ کے سب سے اونچے مقام تک۔',
      },
      {
        key: 'neck_front',
        labelEn: 'Front neck drop',
        labelUr: 'اگلا گلا',
        min: 2,
        max: 14,
        required: false,
        order: 10,
        helpEn: 'How deep the front neckline is cut, from the collarbone.',
        helpUr: 'ہنسلی کی ہڈی سے گلا کتنا گہرا کاٹا جائے۔',
      },
      {
        key: 'neck_back',
        labelEn: 'Back neck drop',
        labelUr: 'پچھلا گلا',
        min: 2,
        max: 16,
        required: false,
        order: 11,
        helpEn: 'How deep the back neckline is cut.',
        helpUr: 'پشت پر گلا کتنا گہرا کاٹا جائے۔',
      },
      {
        key: 'back_width',
        labelEn: 'Back width',
        labelUr: 'پشت کی چوڑائی',
        min: 10,
        max: 22,
        required: false,
        order: 12,
        helpEn: 'Straight across the back, shoulder blade to shoulder blade.',
        helpUr: 'پشت پر سیدھا، دونوں کندھوں کے درمیان۔',
      },
    ],
  },
  {
    // Regular Trousers — Simple Shalwar, Traditional Pants.
    key: 'shalwar',
    aliasesEn: ['Simple Shalwar', 'Traditional Pants'],
    aliasesUr: ['سادہ شلوار', 'روایتی پتلون'],
    baseFabricGaz: 2.5,
    fields: [
      {
        key: 'crotch_depth',
        labelEn: 'Crotch depth (asan)',
        labelUr: 'آسن کی گہرائی',
        min: 6,
        max: 18,
        required: false,
        order: 6,
        helpEn: 'From the waist down through the crotch — the traditional asan measurement that sets how loose the seat sits.',
        helpUr: 'کمر سے نیچے دونوں ٹانگوں کے درمیان تک — روایتی آسن کا ناپ جو نشست کی کھلاؤ طے کرتا ہے۔',
      },
    ],
  },
  {
    // Narrow Pencil Pants — Straight Trousers, Cigarette Pants.
    key: 'trouser',
    aliasesEn: ['Straight Trousers', 'Cigarette Pants'],
    aliasesUr: ['سیدھی ٹراؤزر', 'سگریٹ پینٹ'],
    baseFabricGaz: 2.25,
    fields: [
      {
        key: 'lower_calf',
        labelEn: 'Lower calf',
        labelUr: 'نچلی پنڈلی',
        min: 10,
        max: 22,
        required: false,
        order: 7,
        helpEn: 'Around the leg just above the ankle, for a fitted taper.',
        helpUr: 'ایڑی کے بالکل اوپر ٹانگ کے گرد، فٹڈ تراش کے لیے۔',
      },
      {
        key: 'back_rise',
        labelEn: 'Back rise',
        labelUr: 'پچھلا رائز',
        min: 10,
        max: 22,
        required: false,
        order: 8,
        helpEn: 'From the waist at the back, down through the seat to the crotch seam.',
        helpUr: 'پشت پر کمر سے نیچے نشست سے ہوتے ہوئے کراچ سیم تک۔',
      },
    ],
  },
];

interface SeedNewGarment {
  key: string;
  labelEn: string;
  labelUr: string;
  order: number;
  aliasesEn: string[];
  aliasesUr: string[];
  baseFabricGaz: number;
  /** Rupees — converted with toMinor, matching the STITCHING_PRICES convention above. */
  stitchingPriceRupees: number;
  fields: SeedGarmentField[];
}

/**
 * Every garment key the tech-pack introduces that isn't one of the original
 * five. Stitching prices are estimates scaled against kameez (Rs 1,200) and
 * shalwar (Rs 600): more panels, more fabric and more hand-finishing cost
 * more to stitch.
 */
const NEW_GARMENT_TYPES: SeedNewGarment[] = [
  {
    // Kalidar Frock — Anarkali, Panel Dress, Gown.
    key: 'anarkali',
    labelEn: 'Anarkali (Kalidar Frock)',
    labelUr: 'انارکلی (کلی دار فراک)',
    order: 7,
    aliasesEn: ['Anarkali', 'Panel Dress', 'Gown'],
    aliasesUr: ['انارکلی', 'پینل ڈریس', 'گاؤن'],
    baseFabricGaz: 5.0,
    stitchingPriceRupees: 1800,
    fields: [
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 1 },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 3 },
      {
        key: 'bodice_length',
        labelEn: 'Bodice length',
        labelUr: 'بودیس کی لمبائی',
        min: 8,
        max: 20,
        required: true,
        order: 4,
        helpEn: 'From the shoulder to the waist seam where the flare begins.',
        helpUr: 'شانے سے کمر کی سلائی تک جہاں سے گھیرا شروع ہوتا ہے۔',
      },
      {
        key: 'mid_flank',
        labelEn: 'Mid-flank',
        labelUr: 'درمیانی گھیر',
        min: 24,
        max: 60,
        required: false,
        order: 5,
        helpEn: 'Around the body midway between waist and hip, where the panels flare out.',
        helpUr: 'کمر اور ہپ کے درمیان، جہاں سے پینل پھیلنا شروع ہوں۔',
      },
      {
        key: 'flare_perimeter',
        labelEn: 'Flare perimeter (ghera)',
        labelUr: 'گھیرا',
        min: 60,
        max: 200,
        required: true,
        order: 6,
        helpEn: 'Total sweep around the bottom hem, all panels included.',
        helpUr: 'نچلے دامن کا مکمل گھیر، تمام پینل ملا کر۔',
      },
      { key: 'length', labelEn: 'Total length', labelUr: 'مکمل لمبائی', min: 40, max: 62, required: true, order: 7 },
      {
        key: 'panel_count',
        labelEn: 'Panel (kali) count',
        labelUr: 'کلیوں کی تعداد',
        min: 1,
        max: 12,
        required: false,
        order: 8,
        helpEn: 'Number of flared panels stitched into the skirt — a count, not a measurement in inches.',
        helpUr: 'اسکرٹ میں سلی گئی کلیوں کی تعداد — یہ ناپ نہیں، گنتی ہے۔',
      },
    ],
  },
  {
    // Cross-over Kurti, Traditional Jama.
    key: 'angrakha',
    labelEn: 'Angrakha',
    labelUr: 'انگرکھا',
    order: 8,
    aliasesEn: ['Cross-over Kurti', 'Traditional Jama'],
    aliasesUr: ['کراس اوور کرتی', 'روایتی جامہ'],
    baseFabricGaz: 3.5,
    stitchingPriceRupees: 1500,
    fields: [
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 1 },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 3 },
      {
        key: 'tie_string_point',
        labelEn: 'Tie-string point',
        labelUr: 'ازار بند کا مقام',
        min: 4,
        max: 20,
        required: false,
        order: 4,
        helpEn: 'Where the side tie-string sits, measured down from the underarm.',
        helpUr: 'بغل سے نیچے کی طرف، جہاں سائیڈ کی ڈوری باندھی جائے۔',
      },
      {
        key: 'outer_flap_width',
        labelEn: 'Outer flap width',
        labelUr: 'بیرونی پلے کی چوڑائی',
        min: 6,
        max: 24,
        required: true,
        order: 5,
        helpEn: 'Width of the front flap that crosses over and ties at the side.',
        helpUr: 'اگلے پلے کی چوڑائی جو سائیڈ پر کراس ہو کر بندھتا ہے۔',
      },
      {
        key: 'inner_flap_drop',
        labelEn: 'Inner flap drop',
        labelUr: 'اندرونی پلے کی گہرائی',
        min: 4,
        max: 18,
        required: false,
        order: 6,
        helpEn: 'How far the inner flap sits beneath the outer one.',
        helpUr: 'اندرونی پلا بیرونی پلے کے نیچے کتنا رہے۔',
      },
      { key: 'length', labelEn: 'Total length', labelUr: 'مکمل لمبائی', min: 30, max: 60, required: true, order: 7 },
    ],
  },
  {
    // Floor Gown — Peshwas, Royal Maxi.
    key: 'floor_gown',
    labelEn: 'Floor Gown (Peshwas)',
    labelUr: 'فرش پوش گاؤن (پیش واز)',
    order: 9,
    aliasesEn: ['Peshwas', 'Royal Maxi'],
    aliasesUr: ['پیش واز', 'رائل میکسی'],
    baseFabricGaz: 6.5,
    stitchingPriceRupees: 2200,
    fields: [
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 1 },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      {
        key: 'empire_waist',
        labelEn: 'Empire waist (under-bust)',
        labelUr: 'انڈر بسٹ کمر',
        min: 24,
        max: 56,
        required: true,
        order: 3,
        helpEn: 'Around the body just under the bust, where the gown gathers.',
        helpUr: 'بسٹ کے نیچے، جہاں سے گاؤن میں چنٹ پڑتی ہے۔',
      },
      {
        key: 'floor_length',
        labelEn: 'Floor length (with heels)',
        labelUr: 'فرش تک لمبائی (ہیل کے ساتھ)',
        min: 50,
        max: 66,
        required: true,
        order: 4,
        helpEn: 'Measured while wearing the heels the gown will be worn with.',
        helpUr: 'وہ ہیل پہن کر ناپیں جو گاؤن کے ساتھ پہنی جائے گی۔',
      },
      {
        key: 'ghera_radius',
        labelEn: 'Ghera radius',
        labelUr: 'گھیرے کا رداس',
        min: 20,
        max: 60,
        required: false,
        order: 5,
        helpEn: 'How far the hem flares out from the body at the floor.',
        helpUr: 'فرش کے پاس لباس جسم سے کتنا باہر تک پھیلا ہو۔',
      },
    ],
  },
  {
    // Hip-Length Shirt, Crop Tunic.
    key: 'short_kurti',
    labelEn: 'Short Kurti',
    labelUr: 'شارٹ کرتی',
    order: 10,
    aliasesEn: ['Hip-Length Shirt', 'Crop Tunic'],
    aliasesUr: ['ہپ لینتھ شرٹ', 'کراپ ٹیونک'],
    baseFabricGaz: 2.0,
    stitchingPriceRupees: 1000,
    fields: [
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 1 },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 3 },
      { key: 'hips', labelEn: 'Hips', labelUr: 'ہپس', min: 26, max: 66, required: true, order: 4 },
      {
        key: 'short_length',
        labelEn: 'Short length',
        labelUr: 'مختصر لمبائی',
        min: 18,
        max: 32,
        required: true,
        order: 5,
        helpEn: 'From the shoulder down to the hip-length hem.',
        helpUr: 'شانے سے ہپ تک کی لمبائی تک۔',
      },
    ],
  },
  {
    // Co-ord Top, Matching Twin Set.
    key: 'coord_top',
    labelEn: 'Co-ord Top',
    labelUr: 'کو آرڈ ٹاپ',
    order: 11,
    aliasesEn: ['Co-ord Top', 'Matching Twin Set'],
    aliasesUr: ['کو آرڈ ٹاپ', 'میچنگ ٹوئن سیٹ'],
    baseFabricGaz: 2.25,
    stitchingPriceRupees: 950,
    fields: [
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 1 },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 3 },
      {
        key: 'short_length',
        labelEn: 'Short length',
        labelUr: 'مختصر لمبائی',
        min: 16,
        max: 30,
        required: true,
        order: 4,
      },
      { key: 'armhole', labelEn: 'Armhole', labelUr: 'بازو کا گھیر', min: 12, max: 28, required: false, order: 5 },
      {
        key: 'center_front_length',
        labelEn: 'Center front length',
        labelUr: 'اگلے سینٹر کی لمبائی',
        min: 14,
        max: 34,
        required: false,
        order: 6,
        helpEn: 'From the base of the neck straight down the center front to the hem.',
        helpUr: 'گلے کی بنیاد سے سیدھا نیچے دامن تک، سینٹر فرنٹ پر۔',
      },
    ],
  },
  {
    // Flared Shirt, No-Slit Tunic.
    key: 'aline_tunic',
    labelEn: 'A-Line Tunic',
    labelUr: 'اے لائن ٹیونک',
    order: 12,
    aliasesEn: ['Flared Shirt', 'No-Slit Tunic'],
    aliasesUr: ['فلیئرڈ شرٹ', 'بغیر چاک ٹیونک'],
    baseFabricGaz: 3.0,
    stitchingPriceRupees: 1300,
    fields: [
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 1 },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 3 },
      { key: 'length', labelEn: 'Total length', labelUr: 'مکمل لمبائی', min: 30, max: 55, required: true, order: 4 },
      {
        key: 'daman',
        labelEn: 'Daman (hem width)',
        labelUr: 'دامن کی چوڑائی',
        min: 26,
        max: 70,
        required: true,
        order: 5,
        helpEn: 'Width of the flared bottom hem.',
        helpUr: 'نچلے پھیلے ہوئے دامن کی چوڑائی۔',
      },
    ],
  },
  {
    // Grand Flared Skirt — Lehenga, Ghagra, Pavadai Skirt.
    key: 'lehenga',
    labelEn: 'Lehenga (Ghagra)',
    labelUr: 'لہنگا (گھاگرا)',
    order: 13,
    aliasesEn: ['Grand Flared Skirt', 'Ghagra', 'Pavadai Skirt'],
    aliasesUr: ['گھاگرا', 'پاواڈائی اسکرٹ'],
    baseFabricGaz: 6.0,
    stitchingPriceRupees: 3500,
    fields: [
      {
        key: 'true_waist',
        labelEn: 'True waist (navel tie-point)',
        labelUr: 'اصل کمر (ناف کی سطح)',
        min: 22,
        max: 52,
        required: true,
        order: 1,
        helpEn: 'Around the body at the navel, where the lehenga ties.',
        helpUr: 'ناف کی سطح پر، جہاں لہنگا باندھا جاتا ہے۔',
      },
      { key: 'hips', labelEn: 'Hips', labelUr: 'ہپس', min: 26, max: 66, required: true, order: 2 },
      {
        key: 'floor_length',
        labelEn: 'Floor length (with event shoes)',
        labelUr: 'فرش تک لمبائی (تقریب کے جوتوں کے ساتھ)',
        min: 34,
        max: 46,
        required: true,
        order: 3,
        helpEn: 'Measured while wearing the shoes the lehenga will be worn with.',
        helpUr: 'وہ جوتے پہن کر ناپیں جو تقریب میں پہنے جائیں گے۔',
      },
      {
        key: 'flare_width',
        labelEn: 'Flare width (ghera)',
        labelUr: 'گھیرا',
        min: 80,
        max: 250,
        required: true,
        order: 4,
        helpEn: 'Total sweep around the bottom hem.',
        helpUr: 'نچلے دامن کا مکمل گھیر۔',
      },
      {
        key: 'panel_count',
        labelEn: 'Panel count',
        labelUr: 'پینلز کی تعداد',
        min: 4,
        max: 24,
        required: false,
        order: 5,
        helpEn: 'Number of flared panels stitched into the skirt — a count, not a measurement in inches.',
        helpUr: 'اسکرٹ میں سلے گئے پینلز کی تعداد — یہ ناپ نہیں، گنتی ہے۔',
      },
    ],
  },
  {
    key: 'saree_petticoat',
    labelEn: 'Saree Petticoat',
    labelUr: 'ساڑھی پیٹی کوٹ',
    order: 14,
    aliasesEn: ['Saree Underskirt', 'In-skirt'],
    aliasesUr: ['اندرونی اسکرٹ'],
    baseFabricGaz: 1.5,
    stitchingPriceRupees: 500,
    fields: [
      {
        key: 'tie_waist',
        labelEn: 'Snug tie-waist',
        labelUr: 'تنگ کمر (ازار بند)',
        min: 22,
        max: 50,
        required: true,
        order: 1,
        helpEn: 'Snug around the natural waist, where the drawstring sits.',
        helpUr: 'قدرتی کمر کے گرد تنگ، جہاں ازار بند باندھا جائے۔',
      },
      { key: 'hips', labelEn: 'Hips', labelUr: 'ہپس', min: 26, max: 66, required: true, order: 2 },
      {
        key: 'floor_length',
        labelEn: 'Petticoat floor length',
        labelUr: 'پیٹی کوٹ کی لمبائی (فرش تک)',
        min: 30,
        max: 44,
        required: true,
        order: 3,
      },
    ],
  },
  {
    key: 'maxi_dress',
    labelEn: 'Maxi Dress',
    labelUr: 'میکسی ڈریس',
    order: 15,
    aliasesEn: [],
    aliasesUr: [],
    baseFabricGaz: 5.5,
    stitchingPriceRupees: 1600,
    fields: [
      {
        key: 'front_full_length',
        labelEn: 'Front full length',
        labelUr: 'اگلی مکمل لمبائی',
        min: 48,
        max: 64,
        required: true,
        order: 1,
        helpEn: 'From the shoulder straight down to the floor at the front.',
        helpUr: 'شانے سے سیدھا فرش تک، اگلی طرف سے۔',
      },
      { key: 'chest', labelEn: 'Chest', labelUr: 'چھاتی', min: 24, max: 60, required: true, order: 2 },
      {
        key: 'natural_waist',
        labelEn: 'Natural waist',
        labelUr: 'قدرتی کمر',
        min: 22,
        max: 56,
        required: true,
        order: 3,
      },
      { key: 'shoulder', labelEn: 'Shoulder', labelUr: 'کندھا', min: 10, max: 24, required: true, order: 4 },
      {
        key: 'sleeve_length',
        labelEn: 'Sleeve length',
        labelUr: 'آستین کی لمبائی',
        min: 4,
        max: 30,
        required: false,
        order: 5,
      },
    ],
  },
  {
    key: 'abaya_kaftan',
    labelEn: 'Abaya & Kaftan',
    labelUr: 'عبایا اور قفطان',
    order: 16,
    aliasesEn: ['Abaya', 'Kaftan'],
    aliasesUr: ['عبایا', 'قفطان'],
    baseFabricGaz: 5.0,
    stitchingPriceRupees: 1500,
    fields: [
      {
        key: 'oversized_chest',
        labelEn: 'Oversized chest',
        labelUr: 'کشادہ سینہ',
        min: 32,
        max: 70,
        required: true,
        order: 1,
        helpEn: 'Chest measurement with generous ease for a loose, flowing fit.',
        helpUr: 'ڈھیلے فٹ کے لیے سینے کا ناپ اضافی گنجائش کے ساتھ۔',
      },
      {
        key: 'over_shoulder_span',
        labelEn: 'Over-shoulder span',
        labelUr: 'کندھوں کا کل پھیلاؤ',
        min: 14,
        max: 28,
        required: true,
        order: 2,
        helpEn: 'Straight across the back from one shoulder drop point to the other.',
        helpUr: 'ایک کندھے سے دوسرے کندھے تک، پشت پر سیدھا۔',
      },
      {
        key: 'total_maxi_length',
        labelEn: 'Total maxi length',
        labelUr: 'مکمل لمبائی',
        min: 50,
        max: 66,
        required: true,
        order: 3,
      },
      {
        key: 'wide_wrist',
        labelEn: 'Wide wrist (for easy rolling)',
        labelUr: 'کشادہ کلائی (آسانی سے موڑنے کے لیے)',
        min: 8,
        max: 20,
        required: false,
        order: 4,
        helpEn: 'Sleeve opening at the wrist, kept loose for rolling up.',
        helpUr: 'کلائی پر آستین کا کھلا حصہ، موڑنے کے لیے ڈھیلا رکھا جائے۔',
      },
    ],
  },
  {
    // Heavy Trousers — Patiala Shalwar, Shahi Shalwar.
    key: 'patiala_shalwar',
    labelEn: 'Patiala Shalwar (Heavy Trousers)',
    labelUr: 'پٹیالہ شلوار',
    order: 17,
    aliasesEn: ['Patiala Shalwar', 'Shahi Shalwar'],
    aliasesUr: ['پٹیالہ شلوار', 'شاہی شلوار'],
    baseFabricGaz: 4.0,
    stitchingPriceRupees: 1300,
    fields: [
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 1 },
      {
        key: 'outseam_length',
        labelEn: 'Outseam length',
        labelUr: 'باہری لمبائی',
        min: 28,
        max: 50,
        required: true,
        order: 2,
        helpEn: 'From the waist down the outer leg to the ankle.',
        helpUr: 'کمر سے ٹانگ کے باہری حصے سے ہوتے ہوئے ایڑی تک۔',
      },
      {
        key: 'paincha',
        labelEn: 'Paincha (ankle cuff) width',
        labelUr: 'پائنچہ کی چوڑائی',
        min: 8,
        max: 30,
        required: true,
        order: 3,
        helpEn: 'The gathered cuff at the ankle — Patiala paincha is cut wide for its signature folds.',
        helpUr: 'ایڑی پر چنٹ دار پائنچہ — پٹیالہ کا پائنچہ اپنی مخصوص سلوٹوں کے لیے کشادہ رکھا جاتا ہے۔',
      },
    ],
  },
  {
    // Gathered Leggings — Churidar Pyjama, Moti Pants.
    key: 'churidar_pajama',
    labelEn: 'Churidar Pajama (Gathered Leggings)',
    labelUr: 'چوڑی دار پاجامہ',
    order: 18,
    aliasesEn: ['Churidar Pyjama', 'Moti Pants'],
    aliasesUr: ['چوڑی دار پاجامہ', 'موتی پینٹ'],
    baseFabricGaz: 2.5,
    stitchingPriceRupees: 800,
    fields: [
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 1 },
      {
        key: 'thigh_round',
        labelEn: 'Thigh round',
        labelUr: 'ران کا گھیر',
        min: 14,
        max: 40,
        required: true,
        order: 2,
      },
      {
        key: 'upper_calf',
        labelEn: 'Upper calf',
        labelUr: 'اوپری پنڈلی',
        min: 10,
        max: 24,
        required: false,
        order: 3,
      },
      {
        key: 'lower_calf',
        labelEn: 'Lower calf',
        labelUr: 'نچلی پنڈلی',
        min: 8,
        max: 20,
        required: false,
        order: 4,
      },
      {
        key: 'ankle_round',
        labelEn: 'Ankle round',
        labelUr: 'ایڑی کا گھیر',
        min: 6,
        max: 16,
        required: true,
        order: 5,
        helpEn: 'Snug around the ankle bone. The finished leg is cut about 8-10 inches longer than your leg length and bunched into the signature churidar rings, so this is a fit measurement, not the fabric length.',
        helpUr: 'ٹخنے کے گرد تنگ ناپ۔ مکمل ٹانگ آپ کی اصل لمبائی سے تقریباً 8-10 انچ زیادہ لمبی کاٹی جاتی ہے اور چوڑی دار کی مخصوص چوڑیوں کی صورت میں جمع کی جاتی ہے، اس لیے یہ فٹ کا ناپ ہے، کپڑے کی لمبائی نہیں۔',
      },
    ],
  },
  {
    // Petal Trousers — Tulip Shalwar, Petal Pant.
    key: 'tulip_shalwar',
    labelEn: 'Tulip Shalwar (Petal Trousers)',
    labelUr: 'ٹیولپ شلوار',
    order: 19,
    aliasesEn: ['Tulip Shalwar', 'Petal Pant'],
    aliasesUr: ['ٹیولپ شلوار', 'پیٹل پینٹ'],
    baseFabricGaz: 2.5,
    stitchingPriceRupees: 750,
    fields: [
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 1 },
      { key: 'hips', labelEn: 'Hips', labelUr: 'ہپس', min: 26, max: 66, required: true, order: 2 },
      {
        key: 'outseam_length',
        labelEn: 'Outseam length',
        labelUr: 'باہری لمبائی',
        min: 28,
        max: 50,
        required: true,
        order: 3,
      },
      {
        key: 'calf_width',
        labelEn: 'Calf width',
        labelUr: 'پنڈلی کی چوڑائی',
        min: 10,
        max: 24,
        required: false,
        order: 4,
        helpEn: 'Around the widest point of the draped petal overlap, at calf height.',
        helpUr: 'پنڈلی کی سطح پر، پیٹل کی اوورلیپ کے سب سے چوڑے مقام کے گرد۔',
      },
      {
        key: 'ankle_opening',
        labelEn: 'Ankle opening',
        labelUr: 'ایڑی کا کھلاؤ',
        min: 6,
        max: 18,
        required: true,
        order: 5,
      },
    ],
  },
  {
    // Draped Pants — Dhoti Shalwar, Curved Drape Pant.
    key: 'dhoti_shalwar',
    labelEn: 'Dhoti Shalwar (Draped Pants)',
    labelUr: 'دھوتی شلوار',
    order: 20,
    aliasesEn: ['Dhoti Shalwar', 'Curved Drape Pant'],
    aliasesUr: ['دھوتی شلوار', 'خمدار ڈریپ پینٹ'],
    baseFabricGaz: 2.5,
    stitchingPriceRupees: 700,
    fields: [
      { key: 'waist', labelEn: 'Waist', labelUr: 'کمر', min: 22, max: 60, required: true, order: 1 },
      {
        key: 'thigh_round',
        labelEn: 'Thigh round (loose)',
        labelUr: 'ران کا گھیر (ڈھیلا)',
        min: 14,
        max: 44,
        required: false,
        order: 2,
        helpEn: 'Taken with generous ease — the dhoti drape needs extra room to fall in loose curved folds.',
        helpUr: 'اضافی گنجائش کے ساتھ ناپیں — دھوتی کی ڈریپ کو ڈھیلے خمدار سلوٹوں میں گرنے کے لیے مزید جگہ چاہیے۔',
      },
      {
        key: 'outseam_length',
        labelEn: 'Outseam length',
        labelUr: 'باہری لمبائی',
        min: 28,
        max: 50,
        required: true,
        order: 3,
      },
    ],
  },
  {
    // Knee-Gathered Flare — Gharara Trouser, Ruched Joint Pant.
    key: 'gharara',
    labelEn: 'Gharara (Knee-Gathered Flare)',
    labelUr: 'گھارا',
    order: 21,
    aliasesEn: ['Gharara Trouser', 'Ruched Joint Pant'],
    aliasesUr: ['گھارا ٹراؤزر', 'روچڈ جوائنٹ پینٹ'],
    baseFabricGaz: 4.5,
    stitchingPriceRupees: 1700,
    fields: [
      {
        key: 'high_waist',
        labelEn: 'High waist',
        labelUr: 'اونچی کمر',
        min: 22,
        max: 56,
        required: true,
        order: 1,
      },
      { key: 'hips', labelEn: 'Hips', labelUr: 'ہپس', min: 26, max: 66, required: true, order: 2 },
      {
        key: 'thigh_girth',
        labelEn: 'Thigh girth (goot)',
        labelUr: 'ران کا گھیر (گوٹ)',
        min: 14,
        max: 44,
        required: true,
        order: 3,
        helpEn: 'The precise thigh girth where the upper leg panel is cut close before flaring below the knee.',
        helpUr: 'ران کا درست گھیر جہاں گھٹنے سے نیچے پھیلاؤ سے پہلے اوپری ٹانگ کا پینل قریب سے کاٹا جاتا ہے۔',
      },
      {
        key: 'knee_height',
        labelEn: 'Knee height (waist to above kneecap)',
        labelUr: 'گھٹنے کی اونچائی (کمر سے گھٹنے کے اوپر تک)',
        min: 14,
        max: 28,
        required: true,
        order: 4,
        helpEn: 'From the waist down to just above the kneecap, where the ruched joint sits.',
        helpUr: 'کمر سے نیچے گھٹنے کی ٹوپی کے بالکل اوپر تک، جہاں روچڈ جوڑ رکھا جاتا ہے۔',
      },
      {
        key: 'flare_hem',
        labelEn: 'Lower flare hem circumference',
        labelUr: 'نچلے گھیرے کا طواف',
        min: 60,
        max: 200,
        required: true,
        order: 5,
        helpEn: 'Total sweep around the bottom hem, below the knee joint.',
        helpUr: 'گھٹنے کے جوڑ سے نیچے، نچلے دامن کا مکمل گھیر۔',
      },
      { key: 'length', labelEn: 'Total length', labelUr: 'مکمل لمبائی', min: 34, max: 48, required: true, order: 6 },
    ],
  },
  {
    // Flared Skirt Pants — Sharara, Palazzo, Divided Skirt.
    key: 'sharara_palazzo',
    labelEn: 'Sharara / Palazzo (Flared Skirt Pants)',
    labelUr: 'شرارہ / پلازو',
    order: 22,
    aliasesEn: ['Sharara', 'Palazzo', 'Divided Skirt'],
    aliasesUr: ['شرارہ', 'پلازو', 'ڈیوائیڈڈ اسکرٹ'],
    baseFabricGaz: 3.5,
    stitchingPriceRupees: 1050,
    fields: [
      {
        key: 'high_waist',
        labelEn: 'High waist',
        labelUr: 'اونچی کمر',
        min: 22,
        max: 56,
        required: true,
        order: 1,
      },
      { key: 'hips', labelEn: 'Hips', labelUr: 'ہپس', min: 26, max: 66, required: true, order: 2 },
      {
        key: 'total_outseam',
        labelEn: 'Total outseam',
        labelUr: 'کل باہری لمبائی',
        min: 28,
        max: 50,
        required: true,
        order: 3,
      },
      {
        key: 'leg_flare_width',
        labelEn: 'Leg flare width',
        labelUr: 'ٹانگ کے گھیرے کی چوڑائی',
        min: 20,
        max: 80,
        required: true,
        order: 4,
        helpEn: 'Width of each individual leg at its widest point — each leg flares like its own divided skirt panel.',
        helpUr: 'ہر ٹانگ کے سب سے چوڑے مقام کی چوڑائی — ہر ٹانگ اپنے علیحدہ اسکرٹ پینل کی طرح پھیلتی ہے۔',
      },
    ],
  },
];

/**
 * The RTW standard size matrix from the tech-pack (inches), offered as a
 * one-tap alternative to typing every measurement by hand. "kameezLength" and
 * "pantOutseam" are matrix columns, not field keys — SIZE_CHART_GARMENTS below
 * maps each onto whichever length-shaped field a given garment actually has
 * (a shirt-type garment's hem length, or a trouser-type garment's outseam).
 */
const RTW_SIZE_MATRIX: Array<{
  token: string;
  shoulder: number;
  chest: number;
  waist: number;
  hips: number;
  kameezLength: number;
  pantOutseam: number;
}> = [
  { token: 'XS', shoulder: 13.5, chest: 34, waist: 28, hips: 36, kameezLength: 38, pantOutseam: 37 },
  { token: 'S', shoulder: 14.0, chest: 36, waist: 30, hips: 38, kameezLength: 40, pantOutseam: 38 },
  { token: 'M', shoulder: 14.5, chest: 40, waist: 34, hips: 43, kameezLength: 42, pantOutseam: 39 },
  { token: 'L', shoulder: 15.5, chest: 44, waist: 38, hips: 47, kameezLength: 44, pantOutseam: 40 },
  { token: 'XL', shoulder: 16.5, chest: 48, waist: 42, hips: 52, kameezLength: 45, pantOutseam: 40 },
  { token: 'XXL', shoulder: 17.5, chest: 52, waist: 46, hips: 56, kameezLength: 45, pantOutseam: 41 },
];

/**
 * Only garments whose own fields are shaped like a shirt — shoulder/chest/
 * waist/length — or like a regular trouser — waist/outseam — get a chart.
 * anarkali, angrakha, floor_gown, lehenga, saree_petticoat, maxi_dress and
 * abaya_kaftan are deliberately left out: their schemas are built from
 * bodice/flare/drape/floor measurements the standard shirt matrix has no
 * column for, so a size row would either invent a hips figure the garment
 * doesn't track or mislabel a "length" that means something else there
 * (bodice length vs. floor length vs. total maxi length). coord_top and
 * aline_tunic still get a chart but without a hips column, since neither has
 * a hips field and a crop top's hip measurement isn't meaningful.
 *
 * patiala_shalwar, churidar_pajama, tulip_shalwar, dhoti_shalwar, gharara and
 * sharara_palazzo are left out for the same reason on the trouser side: their
 * fit comes from a paincha width, calf taper, thigh girth or flare hem the
 * plain Waist/PantOutseam columns can't stand in for — offering a picked size
 * would understate exactly the dimension that makes each of them distinct
 * from a regular trouser. shalwar and trouser, by contrast, reduce cleanly to
 * Waist + Outseam, so they use the pantOutseam column via lengthSource below.
 */
const SIZE_CHART_GARMENTS: Array<{
  key: string;
  fieldMap: { shoulder?: string; chest?: string; waist?: string; hips?: string; length: string };
  /** Which matrix column fieldMap.length pulls from. Defaults to the shirt-type kameezLength column. */
  lengthSource?: 'kameezLength' | 'pantOutseam';
}> = [
  {
    key: 'kameez',
    fieldMap: { shoulder: 'shoulder', chest: 'chest', waist: 'waist', hips: 'hips', length: 'length' },
  },
  {
    key: 'short_kurti',
    fieldMap: { shoulder: 'shoulder', chest: 'chest', waist: 'waist', hips: 'hips', length: 'short_length' },
  },
  {
    key: 'coord_top',
    fieldMap: { shoulder: 'shoulder', chest: 'chest', waist: 'waist', length: 'center_front_length' },
  },
  {
    key: 'aline_tunic',
    fieldMap: { shoulder: 'shoulder', chest: 'chest', waist: 'waist', length: 'length' },
  },
  {
    key: 'shalwar',
    fieldMap: { waist: 'waist', length: 'length' },
    lengthSource: 'pantOutseam',
  },
  {
    key: 'trouser',
    fieldMap: { waist: 'waist', hips: 'hips', length: 'length' },
    lengthSource: 'pantOutseam',
  },
];

/**
 * Extends the four garments the tech-pack maps onto an existing key
 * (kameez, blouse, shalwar, trouser), creates the sixteen it introduces as
 * new garment types, then seeds the RTW size chart for whichever of those
 * now have shirt- or trouser-shaped fields to hang it on. Runs right after
 * seedGarmentTypes() so `garments` already holds the original five keys'
 * ids, and grows the same map with every new key it creates.
 */
async function seedGarmentCatalogExpansion(garments: Map<string, string>): Promise<void> {
  for (const extension of GARMENT_EXTENSIONS) {
    const garmentTypeId = garments.get(extension.key);
    if (!garmentTypeId) continue; // seeded out of order — nothing to extend yet

    await prisma.garmentType.update({
      where: { id: garmentTypeId },
      data: {
        aliasesEn: extension.aliasesEn,
        aliasesUr: extension.aliasesUr,
        baseFabricGaz: extension.baseFabricGaz,
      },
    });

    await upsertMeasurementFields(garmentTypeId, extension.fields);
  }

  for (const garment of NEW_GARMENT_TYPES) {
    const record = await prisma.garmentType.upsert({
      where: { key: garment.key },
      update: {
        labelEn: garment.labelEn,
        labelUr: garment.labelUr,
        order: garment.order,
        aliasesEn: garment.aliasesEn,
        aliasesUr: garment.aliasesUr,
        baseFabricGaz: garment.baseFabricGaz,
        stitchingPrice: toMinor(garment.stitchingPriceRupees),
        stitchingEnabled: true,
      },
      create: {
        key: garment.key,
        labelEn: garment.labelEn,
        labelUr: garment.labelUr,
        order: garment.order,
        aliasesEn: garment.aliasesEn,
        aliasesUr: garment.aliasesUr,
        baseFabricGaz: garment.baseFabricGaz,
        stitchingPrice: toMinor(garment.stitchingPriceRupees),
        stitchingEnabled: true,
      },
    });

    await upsertMeasurementFields(record.id, garment.fields);
    garments.set(garment.key, record.id);
  }

  await seedGarmentSizeCharts(garments);
}

/** Same upsert shape seedGarmentTypes() uses inline, reused here for the extension and new-garment fields above. */
async function upsertMeasurementFields(
  garmentTypeId: string,
  fields: SeedGarmentField[],
): Promise<void> {
  for (const field of fields) {
    await prisma.measurementField.upsert({
      where: { garmentTypeId_key: { garmentTypeId, key: field.key } },
      update: {
        labelEn: field.labelEn,
        labelUr: field.labelUr,
        unit: 'INCH',
        min: field.min,
        max: field.max,
        required: field.required,
        order: field.order,
        helpEn: field.helpEn ?? null,
        helpUr: field.helpUr ?? null,
      },
      create: {
        garmentTypeId,
        key: field.key,
        labelEn: field.labelEn,
        labelUr: field.labelUr,
        unit: 'INCH',
        min: field.min,
        max: field.max,
        required: field.required,
        order: field.order,
        helpEn: field.helpEn ?? null,
        helpUr: field.helpUr ?? null,
      },
    });
  }
}

async function seedGarmentSizeCharts(garments: Map<string, string>): Promise<void> {
  for (const target of SIZE_CHART_GARMENTS) {
    const garmentTypeId = garments.get(target.key);
    if (!garmentTypeId) continue;

    for (const [order, row] of RTW_SIZE_MATRIX.entries()) {
      const lengthValue = target.lengthSource === 'pantOutseam' ? row.pantOutseam : row.kameezLength;
      const values: Record<string, number> = { [target.fieldMap.length]: lengthValue };
      if (target.fieldMap.shoulder) values[target.fieldMap.shoulder] = row.shoulder;
      if (target.fieldMap.chest) values[target.fieldMap.chest] = row.chest;
      if (target.fieldMap.waist) values[target.fieldMap.waist] = row.waist;
      if (target.fieldMap.hips) values[target.fieldMap.hips] = row.hips;

      await prisma.garmentSizeChart.upsert({
        where: { garmentTypeId_sizeToken: { garmentTypeId, sizeToken: row.token } },
        update: { values: values as Prisma.InputJsonValue, order },
        create: {
          garmentTypeId,
          sizeToken: row.token,
          values: values as Prisma.InputJsonValue,
          order,
        },
      });
    }
  }
}

interface SeedOptionGroup {
  key: string;
  labelEn: string;
  labelUr: string;
  /**
   * Omitted for a group that applies to every garment — finishing work the
   * workshop offers whatever is being stitched.
   */
  garmentKey?: string;
  /** Body region the storefront files the group under. */
  area:
    | 'neck'
    | 'sleeves'
    | 'upper_front'
    | 'lower_front'
    | 'back'
    | 'trouser'
    | 'finishing'
    | 'bodice'
    | 'skirt_panel'
    | 'outerwear';
  required?: boolean;
  selectionType?: 'SINGLE' | 'MULTI';
  /** Offer a free-text box, for styles no list can enumerate. */
  allowCustomText?: boolean;
  helpEn?: string;
  helpUr?: string;
  order: number;
  options: Array<{ key: string; labelEn: string; labelUr: string; priceDelta: number }>;
}

/**
 * The style menu, one entry per design area of each garment.
 *
 * Two rules hold the pricing together: the plain, everyday version of a style
 * always costs 0, so the panel can preselect a valid default that quotes the
 * garment's base fee, and only genuine upgrades carry a delta.
 */
const STITCHING_OPTION_GROUPS: SeedOptionGroup[] = [
  {
    key: 'neckline',
    labelEn: 'Neckline',
    labelUr: 'گلا',
    garmentKey: 'kameez',
    area: 'neck',
    required: true,
    allowCustomText: true,
    helpEn: 'The shape cut at the front of the neck. Describe anything custom below.',
    helpUr: 'گلے کی اگلی شکل۔ کوئی خاص ڈیزائن نیچے لکھ دیں۔',
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
      {
        key: 'sherwani_collar',
        labelEn: 'Structured Sherwani collar',
        labelUr: 'شیروانی کالر',
        priceDelta: toMinor(300),
      },
      {
        key: 'sweetheart',
        labelEn: 'Sweetheart',
        labelUr: 'سویٹ ہارٹ گلا',
        priceDelta: toMinor(200),
      },
    ],
  },
  {
    key: 'neck_finish',
    labelEn: 'Neck finish',
    labelUr: 'گلے کی فنشنگ',
    garmentKey: 'kameez',
    area: 'neck',
    order: 2,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      { key: 'piping', labelEn: 'Piping', labelUr: 'پائپنگ', priceDelta: toMinor(150) },
      { key: 'lace', labelEn: 'Lace', labelUr: 'لیس', priceDelta: toMinor(300) },
      {
        key: 'embroidered',
        labelEn: 'Embroidered patti',
        labelUr: 'کڑھائی والی پٹی',
        priceDelta: toMinor(700),
      },
    ],
  },
  {
    key: 'kurta_collar',
    labelEn: 'Collar',
    labelUr: 'کالر',
    garmentKey: 'kurta',
    area: 'neck',
    required: true,
    order: 1,
    options: [
      { key: 'band', labelEn: 'Band collar', labelUr: 'بین کالر', priceDelta: 0 },
      { key: 'round', labelEn: 'Round neck', labelUr: 'گول گلا', priceDelta: 0 },
      {
        key: 'shirt',
        labelEn: 'Shirt collar',
        labelUr: 'شرٹ کالر',
        priceDelta: toMinor(150),
      },
      {
        key: 'sherwani',
        labelEn: 'Sherwani collar',
        labelUr: 'شیروانی کالر',
        priceDelta: toMinor(350),
      },
    ],
  },
  {
    key: 'sleeve_style',
    labelEn: 'Sleeve style',
    labelUr: 'آستین',
    garmentKey: 'kameez',
    area: 'sleeves',
    required: true,
    allowCustomText: true,
    order: 3,
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
      {
        key: 'puffed_lantern',
        labelEn: 'Puffed lantern',
        labelUr: 'پفڈ لالٹین آستین',
        priceDelta: toMinor(300),
      },
      {
        key: 'organza_extension',
        labelEn: 'Custom organza extension trim',
        labelUr: 'آرگنزا ایکسٹینشن ٹرم',
        priceDelta: toMinor(950),
      },
    ],
  },
  {
    key: 'sleeve_length',
    labelEn: 'Sleeve length',
    labelUr: 'آستین کی لمبائی',
    garmentKey: 'kameez',
    area: 'sleeves',
    order: 4,
    options: [
      { key: 'full', labelEn: 'Full', labelUr: 'پوری', priceDelta: 0 },
      {
        key: 'three_quarter',
        labelEn: 'Three-quarter',
        labelUr: 'تین چوتھائی',
        priceDelta: 0,
      },
      { key: 'elbow', labelEn: 'Elbow', labelUr: 'کہنی تک', priceDelta: 0 },
      { key: 'short', labelEn: 'Short', labelUr: 'چھوٹی', priceDelta: toMinor(-100) },
    ],
  },
  {
    key: 'cuff_style',
    labelEn: 'Cuff',
    labelUr: 'کف',
    garmentKey: 'kameez',
    area: 'sleeves',
    helpEn: 'Churidar gathers the sleeve into tight folds at the wrist.',
    helpUr: 'چوڑی دار میں آستین کلائی پر چنٹ کے ساتھ تنگ ہو جاتی ہے۔',
    order: 5,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      {
        key: 'buttoned',
        labelEn: 'Buttoned',
        labelUr: 'بٹن والا',
        priceDelta: toMinor(200),
      },
      {
        key: 'elasticated',
        labelEn: 'Elasticated',
        labelUr: 'ایلاسٹک والا',
        priceDelta: toMinor(150),
      },
      {
        key: 'churidar',
        labelEn: 'Churidar',
        labelUr: 'چوڑی دار',
        priceDelta: toMinor(350),
      },
    ],
  },
  {
    key: 'front_placket',
    labelEn: 'Front placket',
    labelUr: 'اگلی پٹی',
    garmentKey: 'kameez',
    area: 'upper_front',
    allowCustomText: true,
    helpEn: 'The strip of fabric that carries the front opening.',
    helpUr: 'کپڑے کی وہ پٹی جس پر اگلا گلا کھلتا ہے۔',
    order: 6,
    options: [
      { key: 'open', labelEn: 'Open', labelUr: 'کھلی', priceDelta: 0 },
      {
        key: 'hidden',
        labelEn: 'Hidden placket',
        labelUr: 'چھپی ہوئی پٹی',
        priceDelta: toMinor(250),
      },
      {
        key: 'button_through',
        labelEn: 'Button-through',
        labelUr: 'پورے بٹن',
        priceDelta: toMinor(400),
      },
    ],
  },
  {
    key: 'yoke_style',
    labelEn: 'Yoke',
    labelUr: 'یوک',
    garmentKey: 'kameez',
    area: 'upper_front',
    allowCustomText: true,
    helpEn: 'The panel across the shoulders and upper chest.',
    helpUr: 'کندھوں اور سینے کے اوپری حصے کا پینل۔',
    order: 7,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      {
        key: 'gathered',
        labelEn: 'Gathered',
        labelUr: 'چنٹ والا',
        priceDelta: toMinor(250),
      },
      {
        key: 'panelled',
        labelEn: 'Panelled',
        labelUr: 'پینل والا',
        priceDelta: toMinor(350),
      },
    ],
  },
  {
    key: 'front_hem',
    labelEn: 'Front hem',
    labelUr: 'اگلا دامن',
    garmentKey: 'kameez',
    area: 'lower_front',
    order: 8,
    options: [
      { key: 'straight', labelEn: 'Straight', labelUr: 'سیدھا', priceDelta: 0 },
      { key: 'rounded', labelEn: 'Rounded', labelUr: 'گول', priceDelta: toMinor(100) },
      {
        key: 'side_slit',
        labelEn: 'Side slits',
        labelUr: 'سائیڈ چاک',
        priceDelta: toMinor(100),
      },
      {
        key: 'high_low',
        labelEn: 'High-low',
        labelUr: 'آگے چھوٹا پیچھے لمبا',
        priceDelta: toMinor(250),
      },
    ],
  },
  {
    key: 'daaman_finish',
    labelEn: 'Daaman finish',
    labelUr: 'دامن کی فنشنگ',
    garmentKey: 'kameez',
    area: 'lower_front',
    allowCustomText: true,
    helpEn: 'The daaman is the bottom edge of the kameez.',
    helpUr: 'دامن قمیض کا نچلا کنارہ ہے۔',
    order: 9,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      { key: 'piping', labelEn: 'Piping', labelUr: 'پائپنگ', priceDelta: toMinor(200) },
      { key: 'lace', labelEn: 'Lace', labelUr: 'لیس', priceDelta: toMinor(450) },
      {
        key: 'embroidered',
        labelEn: 'Embroidered border',
        labelUr: 'کڑھائی والا بارڈر',
        priceDelta: toMinor(900),
      },
    ],
  },
  {
    key: 'back_style',
    labelEn: 'Back style',
    labelUr: 'پشت کا اسٹائل',
    garmentKey: 'kameez',
    area: 'back',
    allowCustomText: true,
    helpEn: 'How the back is cut. Describe a bespoke back below.',
    helpUr: 'پشت کی کٹائی۔ کوئی خاص ڈیزائن نیچے لکھ دیں۔',
    order: 10,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      { key: 'keyhole', labelEn: 'Keyhole', labelUr: 'کی ہول', priceDelta: toMinor(150) },
      {
        key: 'button_back',
        labelEn: 'Button back',
        labelUr: 'پشت پر بٹن',
        priceDelta: toMinor(350),
      },
      {
        key: 'open_back',
        labelEn: 'Open back',
        labelUr: 'کھلی پشت',
        priceDelta: toMinor(400),
      },
    ],
  },
  {
    key: 'back_hem',
    labelEn: 'Back hem',
    labelUr: 'پچھلا دامن',
    garmentKey: 'kameez',
    area: 'back',
    helpEn: 'Matching the front keeps both hems the same length.',
    helpUr: 'اگلے دامن کے برابر رکھنے پر دونوں ایک جیسے رہیں گے۔',
    order: 11,
    options: [
      {
        key: 'match_front',
        labelEn: 'Match the front',
        labelUr: 'اگلے دامن کے برابر',
        priceDelta: 0,
      },
      { key: 'straight', labelEn: 'Straight', labelUr: 'سیدھا', priceDelta: 0 },
      {
        key: 'longer',
        labelEn: 'Longer than the front',
        labelUr: 'اگلے سے لمبا',
        priceDelta: toMinor(150),
      },
    ],
  },
  {
    key: 'blouse_back_closure',
    labelEn: 'Back closure',
    labelUr: 'پشت کی بندش',
    garmentKey: 'blouse',
    area: 'back',
    required: true,
    order: 1,
    options: [
      { key: 'hook', labelEn: 'Hooks', labelUr: 'ہک', priceDelta: 0 },
      { key: 'dori', labelEn: 'Dori tie', labelUr: 'ڈوری', priceDelta: toMinor(200) },
      { key: 'button', labelEn: 'Buttons', labelUr: 'بٹن', priceDelta: toMinor(200) },
      { key: 'zip', labelEn: 'Zip', labelUr: 'زپ', priceDelta: toMinor(250) },
    ],
  },
  {
    key: 'trouser_cut',
    labelEn: 'Trouser cut',
    labelUr: 'ٹراؤزر کٹ',
    garmentKey: 'trouser',
    area: 'trouser',
    required: true,
    order: 1,
    options: [
      { key: 'straight', labelEn: 'Straight', labelUr: 'سیدھا', priceDelta: 0 },
      { key: 'cigarette', labelEn: 'Cigarette', labelUr: 'سگریٹ', priceDelta: toMinor(150) },
      { key: 'bootcut', labelEn: 'Bootcut', labelUr: 'بوٹ کٹ', priceDelta: toMinor(200) },
      { key: 'palazzo', labelEn: 'Palazzo', labelUr: 'پلازو', priceDelta: toMinor(250) },
      { key: 'churidar', labelEn: 'Churidar', labelUr: 'چوڑی دار', priceDelta: toMinor(300) },
    ],
  },
  {
    key: 'trouser_waist_finish',
    labelEn: 'Trouser waist',
    labelUr: 'ٹراؤزر کی کمر',
    garmentKey: 'trouser',
    area: 'trouser',
    order: 2,
    options: [
      { key: 'elastic', labelEn: 'Elastic', labelUr: 'ایلاسٹک', priceDelta: 0 },
      { key: 'drawstring', labelEn: 'Drawstring', labelUr: 'ازار بند', priceDelta: 0 },
      { key: 'both', labelEn: 'Both', labelUr: 'دونوں', priceDelta: toMinor(100) },
    ],
  },
  {
    key: 'trouser_paincha_finish',
    labelEn: 'Trouser hem',
    labelUr: 'ٹراؤزر کا پائنچہ',
    garmentKey: 'trouser',
    area: 'trouser',
    helpEn: 'The paincha is the opening at the bottom of the leg.',
    helpUr: 'پائنچہ ٹانگ کے نچلے حصے کا کھلا کنارہ ہے۔',
    order: 3,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      { key: 'piping', labelEn: 'Piping', labelUr: 'پائپنگ', priceDelta: toMinor(150) },
      { key: 'lace', labelEn: 'Lace', labelUr: 'لیس', priceDelta: toMinor(350) },
    ],
  },
  {
    key: 'shalwar_style',
    labelEn: 'Shalwar style',
    labelUr: 'شلوار اسٹائل',
    garmentKey: 'shalwar',
    area: 'trouser',
    required: true,
    order: 1,
    options: [
      { key: 'classic', labelEn: 'Classic', labelUr: 'کلاسک', priceDelta: 0 },
      { key: 'tulip', labelEn: 'Tulip', labelUr: 'ٹیولپ', priceDelta: toMinor(300) },
      { key: 'patiala', labelEn: 'Patiala', labelUr: 'پٹیالہ', priceDelta: toMinor(350) },
      { key: 'dhoti', labelEn: 'Dhoti', labelUr: 'دھوتی', priceDelta: toMinor(350) },
    ],
  },
  {
    key: 'shalwar_waist_finish',
    labelEn: 'Shalwar waist',
    labelUr: 'شلوار کی کمر',
    garmentKey: 'shalwar',
    area: 'trouser',
    helpEn: 'The nala is the traditional drawstring.',
    helpUr: 'نالہ روایتی ازار بند ہے۔',
    order: 2,
    options: [
      { key: 'elastic', labelEn: 'Elastic', labelUr: 'ایلاسٹک', priceDelta: 0 },
      { key: 'nala', labelEn: 'Nala', labelUr: 'نالہ', priceDelta: 0 },
      { key: 'both', labelEn: 'Both', labelUr: 'دونوں', priceDelta: toMinor(100) },
    ],
  },
  {
    key: 'shalwar_paincha_finish',
    labelEn: 'Shalwar hem',
    labelUr: 'شلوار کا پائنچہ',
    garmentKey: 'shalwar',
    area: 'trouser',
    order: 3,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      { key: 'piping', labelEn: 'Piping', labelUr: 'پائپنگ', priceDelta: toMinor(150) },
      { key: 'lace', labelEn: 'Lace', labelUr: 'لیس', priceDelta: toMinor(350) },
    ],
  },
  {
    key: 'lining',
    labelEn: 'Lining',
    labelUr: 'استر',
    area: 'finishing',
    helpEn: 'Half lining covers the bodice only; full lining covers the whole garment.',
    helpUr: 'آدھا استر صرف اوپر کے حصے پر، مکمل استر پورے لباس پر۔',
    order: 20,
    options: [
      { key: 'none', labelEn: 'None', labelUr: 'کوئی نہیں', priceDelta: 0 },
      { key: 'half', labelEn: 'Half lining', labelUr: 'آدھا استر', priceDelta: toMinor(350) },
      { key: 'full', labelEn: 'Full lining', labelUr: 'مکمل استر', priceDelta: toMinor(700) },
      {
        key: 'shameez',
        labelEn: 'Shameez (opaque under-lining)',
        labelUr: 'شمیز',
        priceDelta: toMinor(700),
      },
      {
        key: 'astar',
        labelEn: 'Astar (opaque under-lining)',
        labelUr: 'استر',
        priceDelta: toMinor(700),
      },
    ],
  },
  {
    key: 'buttons',
    labelEn: 'Buttons',
    labelUr: 'بٹن',
    area: 'finishing',
    order: 21,
    options: [
      { key: 'plain', labelEn: 'Plain', labelUr: 'سادہ', priceDelta: 0 },
      {
        key: 'covered',
        labelEn: 'Fabric-covered',
        labelUr: 'کپڑے والے',
        priceDelta: toMinor(150),
      },
      {
        key: 'decorative',
        labelEn: 'Decorative',
        labelUr: 'ڈیزائنر',
        priceDelta: toMinor(350),
      },
    ],
  },
  {
    key: 'embroidery_placement',
    labelEn: 'Embroidery placement',
    labelUr: 'کڑھائی کی جگہ',
    area: 'finishing',
    selectionType: 'MULTI',
    allowCustomText: true,
    helpEn: 'Pick every place you want embroidery, then describe the design below.',
    helpUr: 'جہاں جہاں کڑھائی چاہیے منتخب کریں، پھر ڈیزائن نیچے لکھ دیں۔',
    order: 22,
    options: [
      {
        key: 'neckline_patti',
        labelEn: 'Neckline patti',
        labelUr: 'گلے کی پٹی',
        priceDelta: toMinor(900),
      },
      {
        key: 'sleeve_border',
        labelEn: 'Sleeve border',
        labelUr: 'آستین کا بارڈر',
        priceDelta: toMinor(800),
      },
      {
        key: 'daaman_border',
        labelEn: 'Daaman border',
        labelUr: 'دامن کا بارڈر',
        priceDelta: toMinor(1500),
      },
      {
        key: 'back_motif',
        labelEn: 'Back motif',
        labelUr: 'پشت کا موٹف',
        priceDelta: toMinor(600),
      },
    ],
  },
  {
    key: 'piping_style',
    labelEn: 'Piping style',
    labelUr: 'پائپنگ اسٹائل',
    area: 'finishing',
    helpEn: 'Magzi lining is the traditional double-layer edge finish stitched under embroidery.',
    helpUr: 'مغزی لائننگ روایتی دوہری تہہ کی کنارہ فنشنگ ہے جو کڑھائی کے نیچے کی جاتی ہے۔',
    order: 23,
    options: [
      { key: 'none', labelEn: 'None', labelUr: 'کوئی نہیں', priceDelta: 0 },
      {
        key: 'satin_piping',
        labelEn: 'Satin piping',
        labelUr: 'ساٹن پائپنگ',
        priceDelta: toMinor(200),
      },
      {
        key: 'magzi_lining',
        labelEn: 'Magzi lining',
        labelUr: 'مغزی لائننگ',
        priceDelta: toMinor(350),
      },
    ],
  },
  {
    key: 'trim_style',
    labelEn: 'Trim style',
    labelUr: 'ٹرم اسٹائل',
    area: 'finishing',
    allowCustomText: true,
    helpEn: 'Pick a border style, then describe exact placement below.',
    helpUr: 'بارڈر کا انداز منتخب کریں، پھر جگہ کی تفصیل نیچے لکھ دیں۔',
    order: 24,
    options: [
      { key: 'none', labelEn: 'None', labelUr: 'کوئی نہیں', priceDelta: 0 },
      {
        key: 'gotta_border',
        labelEn: 'Gotta border',
        labelUr: 'گوٹہ بارڈر',
        priceDelta: toMinor(500),
      },
      {
        key: 'kiran_border',
        labelEn: 'Kiran border',
        labelUr: 'کرن بارڈر',
        priceDelta: toMinor(650),
      },
    ],
  },
  {
    key: 'bodice_fit',
    labelEn: 'Bodice fit',
    labelUr: 'بلاؤز فٹ',
    area: 'bodice',
    allowCustomText: true,
    helpEn: 'How close the bodice sits to the body. Describe any custom shaping below.',
    helpUr: 'بلاؤز جسم کے کتنا قریب ہو۔ کوئی خاص تراش نیچے لکھ دیں۔',
    order: 1,
    options: [
      { key: 'fitted', labelEn: 'Fitted', labelUr: 'فٹڈ', priceDelta: toMinor(150) },
      {
        key: 'semi_fitted',
        labelEn: 'Semi-fitted',
        labelUr: 'نیم فٹڈ',
        priceDelta: 0,
      },
      { key: 'relaxed', labelEn: 'Relaxed', labelUr: 'ڈھیلا', priceDelta: 0 },
    ],
  },
  {
    key: 'skirt_flare',
    labelEn: 'Skirt flare (panels)',
    labelUr: 'اسکرٹ گھیرا (پینل)',
    area: 'skirt_panel',
    allowCustomText: true,
    helpEn:
      'Number of panels stitched into the flare — more panels means a fuller ghera. Describe any custom flare below.',
    helpUr: 'گھیرے میں سلے پینلز کی تعداد — زیادہ پینل زیادہ گھیر دیتے ہیں۔ کوئی خاص تفصیل نیچے لکھ دیں۔',
    order: 1,
    options: [
      { key: '6_panel', labelEn: '6-panel', labelUr: '6 پینل', priceDelta: 0 },
      {
        key: '8_panel',
        labelEn: '8-panel',
        labelUr: '8 پینل',
        priceDelta: toMinor(400),
      },
      {
        key: '12_panel',
        labelEn: '12-panel',
        labelUr: '12 پینل',
        priceDelta: toMinor(800),
      },
      {
        key: 'circular',
        labelEn: 'Circular',
        labelUr: 'سرکلر',
        priceDelta: toMinor(1200),
      },
    ],
  },
  {
    key: 'outerwear_silhouette',
    labelEn: 'Silhouette',
    labelUr: 'کٹ کا انداز',
    area: 'outerwear',
    allowCustomText: true,
    helpEn: 'The overall cut of the abaya, kaftan or maxi. Describe anything custom below.',
    helpUr: 'عبایا، کفتان یا میکسی کا مجموعی کٹ۔ کوئی خاص ڈیزائن نیچے لکھ دیں۔',
    order: 1,
    options: [
      {
        key: 'straight_cut',
        labelEn: 'Straight cut',
        labelUr: 'سیدھا کٹ',
        priceDelta: 0,
      },
      {
        key: 'flared',
        labelEn: 'Flared',
        labelUr: 'پھیلا ہوا',
        priceDelta: toMinor(350),
      },
      {
        key: 'wrap_style',
        labelEn: 'Wrap style',
        labelUr: 'ریپ اسٹائل',
        priceDelta: toMinor(450),
      },
    ],
  },
];

/**
 * Groups an earlier seed created that the area-based menu above replaces —
 * "kameez_finish" bundled lining, piping and side slits into one checkbox list,
 * all three of which now live in the area they belong to.
 *
 * Deactivated rather than deleted, so a cart or order that already references
 * one of its options still renders the customer's choice.
 */
const RETIRED_OPTION_GROUP_KEYS = ['kameez_finish'];

/**
 * Hides the groups above from the customer's stitching form without deleting
 * them, so an existing cart or order that already points at one of their
 * options still renders the choice the customer made.
 *
 * stitching.service.ts selects on `isActive`, so flipping the flag is what
 * takes them off the form; the options are deactivated too, otherwise the
 * group would be gone while its options stayed selectable.
 */
async function retireOldOptionGroups(): Promise<void> {
  for (const key of RETIRED_OPTION_GROUP_KEYS) {
    const group = await prisma.stitchingOptionGroup.findUnique({
      where: { key },
      select: { id: true },
    });
    if (!group) continue;

    await prisma.stitchingOption.updateMany({
      where: { groupId: group.id },
      data: { isActive: false },
    });
    await prisma.stitchingOptionGroup.update({
      where: { id: group.id },
      data: { isActive: false },
    });
  }
}

async function seedStitchingOptions(garments: Map<string, string>) {
  for (const group of STITCHING_OPTION_GROUPS) {
    const shared = {
      labelEn: group.labelEn,
      labelUr: group.labelUr,
      area: group.area,
      required: group.required ?? false,
      selectionType: group.selectionType ?? ('SINGLE' as const),
      allowCustomText: group.allowCustomText ?? false,
      helpEn: group.helpEn ?? null,
      helpUr: group.helpUr ?? null,
      order: group.order,
      garmentTypeId: group.garmentKey ? (garments.get(group.garmentKey) ?? null) : null,
    };

    const record = await prisma.stitchingOptionGroup.upsert({
      where: { key: group.key },
      update: shared,
      create: { key: group.key, ...shared },
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
    { slug: 'kids-wear', en: 'Kids Wear', ur: 'بچوں کے کپڑے', order: 4 },
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

/**
 * The Category every RawMaterial's Product is filed under (WO-C.1,
 * bom.prisma). Its slug must match Setting `bom.raw_material_category_slug`'s
 * default in settings.defaults.ts — hardcoded here the same way
 * seedCategories()'s slugs are, not read back from Setting, since this seed
 * runs before SettingsService.onModuleInit() has a database connection to
 * seed defaults into.
 */
async function seedRawMaterialCategory(): Promise<void> {
  const category = await prisma.category.upsert({
    where: { slug: 'raw-materials' },
    update: {},
    create: { slug: 'raw-materials', isActive: true },
  });

  for (const [locale, name] of [
    ['en', 'Raw Materials'],
    ['ur', 'خام مال'],
  ] as const) {
    await prisma.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId: category.id, locale } },
      update: { name },
      create: { categoryId: category.id, locale, name },
    });
  }
}

interface SeedProduct {
  slug: string;
  kind: 'STITCHED' | 'UNSTITCHED';
  categorySlug: string;
  /**
   * Placeholder swatch in apps/web/public/placeholders, referenced by a
   * root-relative URL so the web app serves it. Real photography replaces this
   * through the admin uploader without any code change.
   */
  placeholder: string;
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
    placeholder: '/placeholders/lawn-ferozi.svg',
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
    placeholder: '/placeholders/lawn-rose.svg',
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
    placeholder: '/placeholders/khaddar-olive.svg',
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
    placeholder: '/placeholders/cotton-white.svg',
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
    placeholder: '/placeholders/chiffon-maroon.svg',
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
    slug: 'kids-wash-n-wear-2-piece-grey',
    placeholder: '/placeholders/washnwear-grey.svg',
    kind: 'UNSTITCHED',
    categorySlug: 'kids-wear',
    nameEn: "Kids' Wash & Wear 2-Piece — Grey",
    nameUr: 'بچوں کے کپڑے واش اینڈ ویئر ٹو پیس — سرمئی',
    descriptionEn:
      'Classic wash & wear shalwar kameez fabric for kids. Needs no ironing after a wash.',
    descriptionUr: 'بچوں کے لیے کلاسک واش اینڈ ویئر شلوار قمیض کا کپڑا۔',
    priceRupees: 3200,
    fabric: 'wash-n-wear',
    season: 'all-season',
    tags: ['kids-wear', 'casual'],
    pieceCount: 2,
    fabricMeters: 7,
    stitchingAvailable: true,
    garmentKeys: ['kurta', 'shalwar'],
    featuredRank: 50,
    variants: [{ size: 'Free size', color: 'Grey', colorHex: '#6d6f74', stock: 30 }],
  },
];

async function seedProducts(
  categories: Map<string, string>,
  garments: Map<string, string>,
  locationId: string,
) {
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
        brandId: await houseBrandId(),
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
      const pv = await prisma.productVariant.upsert({
        where: { sku },
        update: {},
        create: {
          productId: product.id,
          sku,
          size: variant.size ?? null,
          color: variant.color,
          colorHex: variant.colorHex,
          stock: 0,
          order: index,
        },
      });

      if (pv.stock !== variant.stock) {
        const delta = variant.stock - pv.stock;
        await inventoryService.move({
          variantId: pv.id,
          locationId,
          delta,
          reason: delta > 0 ? 'PURCHASE_RECEIPT' : 'ADJUSTMENT',
          note: 'seed',
        });
      }
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

    await upsertPlaceholderImage(product.id, definition.placeholder, definition.nameEn);
  }
}

/**
 * Attaches the generated swatches to a product: the primary shot plus a
 * "-detail" companion, which is what the storefront card fades to on hover.
 *
 * Bails the moment the product has any image that is not one of ours, so
 * re-running the seed can never undo the shop's own photography.
 */
async function upsertPlaceholderImage(
  productId: string,
  url: string,
  alt: string,
): Promise<void> {
  const existing = await prisma.productImage.findMany({ where: { productId } });
  if (existing.some((image) => !image.url.startsWith('/placeholders/'))) return;

  const detail = url.replace(/\.svg$/, '-detail.svg');
  const wanted = [
    { url, isPrimary: true },
    { url: detail, isPrimary: false },
  ];

  for (const [order, image] of wanted.entries()) {
    if (existing.some((candidate) => candidate.url === image.url)) continue;

    await prisma.productImage.create({
      data: {
        productId,
        url: image.url,
        alt,
        order,
        // Only claim primary if nothing already holds it, so a product seeded
        // by an earlier run keeps the image it already leads with.
        isPrimary: image.isPrimary && !existing.some((candidate) => candidate.isPrimary),
      },
    });
  }
}

async function seedStitchingServices(
  categories: Map<string, string>,
  garments: Map<string, string>,
  locationId: string,
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
    const pv = await prisma.productVariant.upsert({
      where: { sku },
      update: {},
      create: { productId: product.id, sku, size: null, color: null, stock: 0 },
    });
    if (pv.stock !== 9999) {
      await inventoryService.move({
        variantId: pv.id,
        locationId,
        delta: 9999 - pv.stock,
        reason: 'ADJUSTMENT',
        note: 'seed',
      });
    }

    await upsertPlaceholderImage(
      product.id,
      '/placeholders/stitching-service.svg',
      service.nameEn,
    );
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

/**
 * A small workshop queue, so the tailor screens and the dashboard's stitching
 * strip are populated on a fresh clone rather than showing an empty state.
 *
 * These are own-fabric bookings (the standalone door into the queue), which
 * keeps the seed independent of whether any orders have been placed yet. Jobs
 * bought alongside fabric arrive through the `order.placed` subscriber and need
 * no seeding.
 */
async function seedWorkshopQueue(
  tailorId: string,
  garments: Map<string, string>,
): Promise<void> {
  const kameezId = garments.get('kameez');
  const shalwarId = garments.get('shalwar');
  const kurtaId = garments.get('kurta');
  if (!kameezId || !shalwarId || !kurtaId) return;

  const bookings: Array<{
    number: string;
    name: string;
    phone: string;
    status: 'AWAITING_FABRIC' | 'FABRIC_RECEIVED' | 'IN_PRODUCTION' | 'READY';
    fabricReceived: boolean;
    fabricNotes: string;
    jobs: Array<{
      number: string;
      garmentTypeId: string;
      stage: 'RECEIVED' | 'CUTTING' | 'STITCHING' | 'QC' | 'READY';
      assign: boolean;
      dueInDays: number;
      measurements: Prisma.InputJsonValue;
      instructions?: string;
    }>;
  }> = [
    {
      number: 'STO-DEMO-0001',
      name: 'Sana Iqbal',
      phone: '+923005551001',
      status: 'AWAITING_FABRIC',
      fabricReceived: false,
      fabricNotes: '3 metres lawn, to be collected from Gulberg.',
      jobs: [
        {
          number: 'JOB-DEMO-0001',
          garmentTypeId: kameezId,
          stage: 'RECEIVED',
          assign: false,
          dueInDays: 9,
          measurements: { length: 42, chest: 38, waist: 34, hips: 40, shoulder: 15 },
        },
      ],
    },
    {
      number: 'STO-DEMO-0002',
      name: 'Hina Raza',
      phone: '+923005551002',
      status: 'IN_PRODUCTION',
      fabricReceived: true,
      fabricNotes: 'Khaddar suit, customer dropped it in.',
      jobs: [
        {
          number: 'JOB-DEMO-0002',
          garmentTypeId: kameezId,
          stage: 'CUTTING',
          assign: true,
          dueInDays: 5,
          measurements: { length: 44, chest: 40, waist: 36, hips: 42, shoulder: 16 },
          instructions: 'Slightly loose through the waist.',
        },
        {
          number: 'JOB-DEMO-0003',
          garmentTypeId: shalwarId,
          stage: 'STITCHING',
          assign: true,
          dueInDays: 5,
          measurements: { length: 40, waist: 36, hips: 44, bottom: 14 },
        },
      ],
    },
    {
      number: 'STO-DEMO-0003',
      name: 'Bilal Ahmed',
      phone: '+923005551003',
      status: 'IN_PRODUCTION',
      fabricNotes: 'Two kurta pieces, wash-and-wear.',
      fabricReceived: true,
      jobs: [
        {
          number: 'JOB-DEMO-0004',
          garmentTypeId: kurtaId,
          stage: 'QC',
          assign: true,
          // Deliberately in the past, so the overdue filter has something to find.
          dueInDays: -2,
          measurements: { length: 41, chest: 42, shoulder: 18, sleeve_length: 24 },
        },
        {
          number: 'JOB-DEMO-0005',
          garmentTypeId: kurtaId,
          stage: 'READY',
          assign: true,
          dueInDays: 1,
          measurements: { length: 41, chest: 42, shoulder: 18, sleeve_length: 24 },
        },
      ],
    },
  ];

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const booking of bookings) {
    const record = await prisma.stitchingOrder.upsert({
      where: { number: booking.number },
      update: { status: booking.status },
      create: {
        number: booking.number,
        status: booking.status,
        guestName: booking.name,
        guestPhone: booking.phone,
        fabricNotes: booking.fabricNotes,
        fabricReceivedAt: booking.fabricReceived ? new Date(now - 3 * dayMs) : null,
        promisedAt: new Date(now + 7 * dayMs),
      },
    });

    for (const job of booking.jobs) {
      const created = await prisma.stitchingJob.upsert({
        where: { number: job.number },
        update: { stage: job.stage },
        create: {
          number: job.number,
          stitchingOrderId: record.id,
          garmentTypeId: job.garmentTypeId,
          measurementSnapshot: job.measurements,
          instructions: job.instructions ?? null,
          stage: job.stage,
          assignedTailorId: job.assign ? tailorId : null,
          dueAt: new Date(now + job.dueInDays * dayMs),
          startedAt: job.stage === 'RECEIVED' ? null : new Date(now - 2 * dayMs),
          completedAt: job.stage === 'READY' ? new Date(now - dayMs) : null,
        },
      });

      // Give each job the trail it would have accumulated getting this far, so
      // the customer timeline and the job detail page have something to show.
      const reached = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(job.stage) + 1);
      for (const [index, stage] of reached.entries()) {
        const exists = await prisma.stitchingJobEvent.findFirst({
          where: { jobId: created.id, toStage: stage },
        });
        if (exists) continue;

        await prisma.stitchingJobEvent.create({
          data: {
            jobId: created.id,
            fromStage: index === 0 ? null : reached[index - 1],
            toStage: stage,
            note: index === 0 ? `Booking ${booking.number}` : null,
            createdAt: new Date(now - (reached.length - index) * dayMs),
          },
        });
      }
    }
  }
}

const STAGE_ORDER = ['RECEIVED', 'CUTTING', 'STITCHING', 'QC', 'READY'] as const;

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

/**
 * The shop's own label, as a Brand row.
 *
 * Products used to carry `brand: 'Yaseen'` as free text. Seeded products now
 * point at a real brand, so the seeded catalogue exercises the same path the
 * admin does. Memoised because seedProducts calls it once per product.
 */
let houseBrandIdCache: string | null = null;
async function houseBrandId(): Promise<string> {
  if (houseBrandIdCache) return houseBrandIdCache;

  const existing = await prisma.brand.findUnique({ where: { slug: 'yaseen' } });
  if (existing) {
    houseBrandIdCache = existing.id;
    return existing.id;
  }

  const brand = await prisma.brand.create({
    data: {
      slug: 'yaseen',
      translations: { create: [{ locale: DEFAULT_LOCALE, name: 'Yaseen' }] },
    },
  });
  houseBrandIdCache = brand.id;
  return brand.id;
}
