/**
 * THE BRAND FILE.
 *
 * This is the one file you edit to rebrand the whole product for a new
 * client. Everything below is a value the client owns — their name, their
 * colours, their corner radius, their currency, their phone format. Nothing
 * below is a decision about how the software works.
 *
 * What is NOT here, and cannot be:
 *
 *   - The `@newax/*` package scope. `import … from '@newax/shared'` is a
 *     static string the bundler resolves before any code runs, so it can
 *     never read a value from here. That is exactly why the scope is the
 *     builder's name and not the client's: Newax is the constant across
 *     every deployment, so the scope never has to change and a rebrand
 *     never touches an import.
 *   - Artwork. The paths are listed under `assets`; the pixels are files, so
 *     a rebrand replaces the files those paths point at.
 *   - Copy. Customer-facing words are translation rows (House Rule 6), not
 *     constants — a rebrand should not be able to change what a page says.
 *
 * Everything else — every colour, size, contact detail and locale
 * assumption in web, API and mobile — resolves here. Change a value, rebuild
 * shared, and all three surfaces follow.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

const identity = {
  /** Full legal-ish name. Invoices, emails, the Organization schema. */
  name: 'Yaseen Fabrics & Stitching',
  /** Short form for tight spaces — the header, the app switcher. */
  shortName: 'Yaseen.pk',
  /**
   * The name in the shop's second language, for the places that print both.
   *
   * Not a translation row: a business name is brand, not copy, and a rebrand
   * must be able to change it. Copy is what a page *says* about the business.
   */
  nameUr: 'یٰسین',
  /** One line, under the name. Shown on the storefront and in metadata. */
  tagline: 'Premium Fabrics & Custom Stitching',
  /** Bare host, no protocol. */
  domain: 'yaseen.pk',
  /** Canonical origin. NEXT_PUBLIC_SITE_URL overrides this per environment. */
  url: 'https://yaseen.pk',
  /** What the back office calls itself in its own title bar. */
  adminName: 'Yaseen Admin',
} as const;

// ---------------------------------------------------------------------------
// Contact & location
// ---------------------------------------------------------------------------

const contact = {
  email: 'support@yaseen.pk',
  phone: '+92 335 621 2709',
  whatsapp: '+92 335 621 2709',
  address: 'K 491, Shah Rukn e Alam Colony, Multan, Pakistan',
  city: 'Multan',
  country: 'Pakistan',
  workingHours: '9 AM – 8 PM, Monday to Saturday',
  supportResponseTime: 'Within 1–2 business days',
} as const;

const socials = {
  facebook: 'https://facebook.com/yaseen.pk',
  instagram: 'https://instagram.com/yaseen.pk',
  tiktok: 'https://tiktok.com/@yaseen.pk',
  youtube: 'https://youtube.com/@yaseen_pk',
} as const;

/**
 * Registration numbers, and what the country calls them. A Pakistani invoice
 * says NTN; a UAE one says TRN and a British one says VAT — the label is as
 * much a locale fact as the number is a client fact.
 */
const legal = {
  taxLabel: 'NTN',
  taxNumber: 'NTN-XXXXXXX-X',
  registrationLabel: 'SECP',
  registrationNumber: 'SECP-XXXXXXX',
} as const;

const banking = {
  bankName: 'Meezan Bank',
  accountTitle: 'Yaseen Fabrics',
  accountNumber: '00000000000000',
  iban: 'PK00 MEEZ 0000 0000 0000 0000',
} as const;

// ---------------------------------------------------------------------------
// Locale
//
// Everything here was hardcoded in 46 places before: 'PKR' in the money
// formatter, '+92' in the phone parser, 'Asia/Karachi' in the settings
// defaults and the report SQL, 'en-PK' in a dozen Intl calls. A client in
// Dubai or London is a change to this block, not a project.
// ---------------------------------------------------------------------------

const locale = {
  /** ISO 4217. Drives Intl.NumberFormat everywhere money is shown. */
  currency: 'PKR',
  /** Shown where a symbol reads better than a code. */
  currencySymbol: 'Rs.',
  /**
   * Minor units in one major unit. 100 for rupees/dollars/dirhams, 1000 for
   * dinars, 1 for yen. Every amount in the database is an integer of these.
   */
  minorUnitsPerMajor: 100,

  /** ISO 3166-1 alpha-2. */
  countryCode: 'PK',
  /** Dial code without the plus. */
  dialCode: '92',
  /** Digits after the dial code in a valid national number. */
  nationalNumberLength: 10,
  /** Leading digit(s) that mark a mobile rather than a landline. */
  mobilePrefix: '3',

  /** IANA zone. The shop's day boundary — never a user-supplied value. */
  timeZone: 'Asia/Karachi',

  /**
   * The top-level administrative regions a delivery address picks from.
   *
   * These were typed into the checkout page, which made them the most
   * expensive kind of literal: not a colour somebody notices, but a list that
   * is silently, confidently wrong the first time this ships anywhere else.
   * A UAE client needs emirates; a UK one needs counties and a different
   * label for the field entirely.
   */
  regionLabel: 'Province',
  regions: [
    'Sindh',
    'Punjab',
    'Khyber Pakhtunkhwa',
    'Balochistan',
    'Islamabad Capital Territory',
    'Gilgit-Baltistan',
    'Azad Jammu & Kashmir',
  ] as const,

  /** The locales the product ships. First is the default. */
  locales: ['en', 'ur'] as const,
  /** BCP 47 tags for Intl, per locale. */
  intlTags: { en: 'en-PK', ur: 'ur-PK' } as const,
  /** Which of the above are written right to left. */
  rtlLocales: ['ur'] as const,
} as const;

// ---------------------------------------------------------------------------
// Theme — colour, shape, type
//
// These used to be three separate files, and before that they were forked
// per surface: a palette in tailwind.config and another in mobile's
// theme.ts, a radius in globals.css and another in theme.ts, a type scale in
// Tailwind's defaults and another hand-picked for the app. Every one of them
// had drifted. They are one set now, and theme-colors.ts / theme-radii.ts /
// theme-type.ts are thin views onto this so the 119 existing imports keep
// working.
// ---------------------------------------------------------------------------

const colors = {
  /** The monochrome ramp: every background, border and text colour. */
  neutral: {
    50: '#F2F2F2',
    100: '#E8E8E8',
    200: '#C6C5C5',
    300: '#A3A1A2',
    400: '#8E8C8C',
    500: '#787676',
    600: '#514E4E',
    700: '#292526',
    800: '#1E1B1C',
    900: '#121111',
  },
  /** The one brand colour. Calls to action, links, focus rings. */
  accent: {
    DEFAULT: '#0f8fa3',
    hover: '#0b6d7d',
  },
  /**
   * The surface cards sit on, and the label colour on a filled button.
   * Named because the two error routes that render before any stylesheet,
   * and the chart that draws gaps between slices, each need it as a value.
   */
  white: '#ffffff',
  /** Rating stars only. Never repurpose it. */
  star: '#F5B841',
  /**
   * Direction, not decoration.
   *
   * A metric's delta, a confirmation, a destructive action. Deliberately not
   * the accent: the accent moves with the client, while "this went up" has to
   * stay green whatever the brand is. Red is reserved hard - a delete or a
   * failure, never an emphasis.
   */
  feedback: {
    positive: '#0F7A4D',
    negative: '#B42318',
  },
} as const;

/**
 * Corner radius, in px. `sharp` is the house shape; `lg` is a hair softer for
 * large panels where a hard corner reads as unfinished. `pill` is not a
 * radius choice — it is how a circle is spelled, and it does not move when
 * the sharpness does.
 */
const radii = {
  sharp: 2,
  lg: 3,
  pill: 9999,
} as const;

/**
 * Type scale in px, size and line height together. React Native derives
 * neither, and Nastaliq descenders collide without an explicit line height.
 * These are Tailwind's own steps, because web uses those utilities at 817
 * call sites.
 */
const type = {
  /**
   * The eyebrow. Column headers, metric labels, the group headings down the
   * side of a nav - always uppercase, always the quietest grey. Deliberately
   * below `tiny`: at 11px nobody mistakes it for content, which is the job.
   */
  micro: { size: 11, line: 16 },
  tiny: { size: 12, line: 16 },
  small: { size: 14, line: 20 },
  body: { size: 16, line: 24 },
  large: { size: 18, line: 28 },
  heading: { size: 20, line: 28 },
  title: { size: 24, line: 32 },
  display: { size: 30, line: 36 },
  /**
   * The number in a metric cell, and nothing else. A figure read at a glance
   * has to outrank its own label by a wide margin - that size difference is
   * exactly why a row of metrics needs no boxes around each one.
   */
  metric: { size: 40, line: 44 },
} as const;

/**
 * Font families.
 *
 * `googleFont` names the next/font import in the storefront layout. It is the
 * one font value that is not purely data: next/font resolves that import
 * statically so it can self-host the file, so changing the typeface means
 * editing the import there as well as this value.
 */
const fonts = {
  googleFont: 'Encode_Sans',
  displayStack: ['var(--font-display)', 'Encode Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  sansStack: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
  /** Nastaliq where the reader has it, then anything that renders Urdu. */
  rtlStack: ['Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', 'system-ui', 'sans-serif'],
  /** Urdu in Nastaliq needs this much leading or the descenders collide. */
  rtlLineHeight: 2.1,
} as const;

// ---------------------------------------------------------------------------
// Artwork
//
// Paths, not pixels. `pnpm rebrand` replaces the files these point at; the
// code only ever refers to them through here.
// ---------------------------------------------------------------------------

const assets = {
  /** Vector master. Browser tab icon, and what the raster is rendered from. */
  icon: '/icon.svg',
  /** Raster export for the Organization schema, which will not take SVG. */
  logoRaster: '/logo-1024.png',
  mobileIcon: './assets/icon.png',
  mobileAdaptiveIcon: './assets/adaptive-icon.png',
  mobileSplash: './assets/splash.png',
} as const;

// ---------------------------------------------------------------------------
// Commerce defaults
//
// Starting values only. Each is a Settings row at runtime (House Rule 4), so
// a shop changes them in the back office without a deploy — these are what a
// fresh install begins with.
// ---------------------------------------------------------------------------

const commerce = {
  /**
   * Stamped on every order number: YSN-2026-0001.
   *
   * The client's initials, so it belongs here — it was written into the
   * generator, where a case-insensitive search for the client's name would
   * never find it. Changing it changes new numbers only; orders already
   * placed keep the number they were given, which is the whole point of a
   * number. Document types that are not brand — PO, GRN, JOB, STO, SC —
   * stay literal in their own services.
   */
  orderNumberPrefix: 'YSN',

  standardDeliveryTime: '3-5 Working Days',
  stitchingTurnaroundTime: '10-14 Working Days',
  /** In major units, not minor — this is a figure a human types. */
  freeShippingThreshold: 5000,
} as const;

// ---------------------------------------------------------------------------

export const BRAND = {
  identity,
  contact,
  socials,
  legal,
  banking,
  locale,
  theme: { colors, radii, type, fonts },
  assets,
  commerce,
} as const;

export type Brand = typeof BRAND;
