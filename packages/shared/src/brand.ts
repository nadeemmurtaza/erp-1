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
  /**
   * The one brand colour. Calls to action, links, focus rings.
   *
   * Darkened from the original #0f8fa3 / #0b6d7d — same hue and saturation
   * (188°, 83%), lightness only — after `check-contrast.mjs` found
   * white-on-DEFAULT (the primary button, every surface) at 3.83:1, under
   * the 4.5:1 WCAG AA floor for text (COL-3). DEFAULT clears white text at
   * 4.55:1; HOVER, which also stands alone as link/nav text on the
   * `neutral-50` page background, clears 4.5:1 even at 80% alpha there
   * (its one such call site) with margin to spare.
   */
  accent: {
    DEFAULT: '#0e8294',
    hover: '#095865',
  },
  /**
   * The label colour on a filled button, and on anything else that is always
   * dark behind it. Named because the two error routes that render before any
   * stylesheet need it as a value.
   *
   * `bg-white` is NOT this colour any more — it resolves to `surface` below,
   * because "the thing a card is made of" and "the label on a solid fill" are
   * the same white in light and two different colours in dark. `text-white`
   * stays fixed; `bg-white` follows the theme.
   */
  white: '#ffffff',
  /**
   * The surface cards, panels and inputs sit on — one step above the page
   * (`neutral.50`). Light: white. Dark: one step lighter than the page,
   * because in a dark interface "higher" means lighter (the eye reads a
   * shadow's absence as elevation). Also the chart background.
   */
  surface: '#ffffff',
  /**
   * The surface of anything that floats over other surfaces — dialogs,
   * menus, popovers, toasts, drawers. Identical to `surface` in light, where
   * a shadow carries the lift; one step lighter than it in dark, where a
   * shadow cannot (a black shadow on a near-black page is invisible).
   */
  overlay: '#ffffff',
  /**
   * The strongest fill, and the label on it: a selected chip, a count badge,
   * the step number in a wizard. Light: near-black with a white label. Dark:
   * near-white with a near-black label. This pair exists because a
   * `bg-neutral-900` fill carrying `text-white` cannot survive a theme — the
   * ramp flips, the fixed white label does not, and white-on-near-white is
   * unreadable.
   */
  inverse: '#121111',
  onInverse: '#ffffff',
  /**
   * The veil behind a modal or drawer. Dark-tinted in both themes: a dim
   * layer over a dark page is still dark, and a light one would bleach it.
   * Used only with an alpha (`bg-scrim/40`).
   */
  scrim: '#121111',
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
  /**
   * The categorical ramp for a multi-series chart (10-admin-dashboard.md
   * D9, WO-A.2). Six hues, index 0 is the existing single-series accent
   * teal so a report that grows from one series to several keeps its
   * primary colour. Each clears 3:1 against white (the graphical-object
   * floor, not the 4.5:1 text floor) and stays separable in the common
   * dichromacies without relying on red-green alone — chart wrappers pair
   * every hue with a dash pattern and a marker shape for exactly that
   * reason (see chart-theme.ts).
   */
  chart: ['#0e8294', '#b8860b', '#4a6fa5', '#8a5a44', '#5f7a4f', '#7d5ba6'],
} as const;

/**
 * The dark palette — the same roles as `colors`, re-derived, never inverted.
 *
 * COL-5: to keep contrast you darken on light and lighten on dark, so the same
 * hex cannot serve both. Every semantic colour above resolves through a token
 * per theme; this is the dark half. Each value is held to a measured floor by
 * `check-contrast.mjs` and `theme-contrast.spec.ts`, not chosen by eye:
 *
 *   text on page/surface/overlay  4.5:1   (neutral 400 and up)
 *   a control's outline           3:1     (neutral 200, on surface)
 *   white label on a brand fill   4.5:1   (accent / accent.hover)
 *
 * The ramp keeps its direction of meaning — `50` is still the page, `100` the
 * soft edge, `200` the control edge, `500` the quiet text, `900` the strong
 * text — and only the lightness is reversed. It keeps the light ramp's warm
 * hue (red a hair above green) so the two themes read as one product.
 *
 * Surfaces climb: page (`neutral.50`) < `surface` < `overlay`. That ordering is
 * how a dark interface says "this is higher", since a shadow cannot.
 */
const colorsDark = {
  neutral: {
    50: '#0c0b0b',
    100: '#2b292a',
    200: '#6d6b6c',
    300: '#7b797a',
    400: '#8c8a8b',
    500: '#a3a1a2',
    600: '#bbb9ba',
    700: '#d1cfd0',
    800: '#e6e4e5',
    900: '#f9f7f8',
  },
  /**
   * The brand FILL is the same in both themes: a white label has to keep
   * reading on it, and a lighter teal would drop white-on-fill under 4.5:1.
   * What changes in dark is the brand INK — see `accentInk`.
   */
  accent: {
    DEFAULT: '#0e8294',
    hover: '#095865',
  },
  /**
   * The brand as TEXT, a line or a focus ring on a dark surface. Lighter than
   * the fill because the fill (L≈0.18) only reaches 4.0:1 on a dark surface,
   * and a link needs 4.5:1. Fill and ink are one colour in light — that is
   * why light has no `accentInk` — and two colours in dark, which is the whole
   * reason `bg-accent` and `text-accent` resolve through different tokens.
   */
  accentInk: {
    DEFAULT: '#3db8cb',
    hover: '#8fdae6',
  },
  white: '#ffffff',
  surface: '#171516',
  overlay: '#242122',
  inverse: '#f9f7f8',
  onInverse: '#121111',
  scrim: '#000000',
  star: '#F5B841',
  feedback: {
    positive: '#3dcb8b',
    negative: '#ff8a80',
  },
  chart: ['#2ba6b9', '#d4a72c', '#7c9bd0', '#c08f77', '#8fb07a', '#ae8ad6'],
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

/**
 * Spacing, in px — one scale for padding, gaps and section rhythm (SPA-1).
 *
 * Every step is an existing Tailwind step (`space[3]` = 8px = `p-2`), so web
 * needs no new utilities and nothing moved on screen: `theme-space.spec.ts`
 * proves the match rather than trusting this comment. The scale exists as a
 * value so React Native, which has no `p-2`, reads the same numbers.
 *
 * It stops at 64. A gap larger than that is a layout decision (a section, a
 * hero) made with `container-page` and `clamp()`, not a spacing step.
 */
const space = {
  0: 0,
  1: 2,
  2: 4,
  3: 8,
  4: 12,
  5: 16,
  6: 24,
  7: 32,
  8: 48,
  9: 64,
} as const;

/**
 * Sizes that belong to a control, not to a layout, in px.
 *
 * `control` is a control's visual height (`xl` is the field of a sign-in or
 * sign-up form, FRM-2: one decision per screen, so each control may be large);
 * `touch` is the smallest target a
 * finger hits reliably and it floors the control height wherever a touch
 * screen is plausible (ACT-1, ACC-4) — which is why `.btn` is 44 tall on a
 * phone and 40 once a pointer is likely. `pos` is the till's own floor: a
 * cashier taps without looking, on glass, in a hurry.
 */
const size = {
  control: { sm: 32, md: 40, lg: 48, xl: 56 },
  icon: { sm: 16, md: 20, lg: 24 },
  touch: { min: 44, pos: 48 },
} as const;

/**
 * Elevation — four ordered steps, each exactly one shadow (chapter 01).
 *
 * Shadows are neutral-tinted, not pure black: a shadow is a darker version of
 * the surface it falls on, and #121111 at low alpha reads as that, where rgb(0
 * 0 0) reads as a hole. Each step is two layers — a tight contact shadow that
 * anchors the object and a wide ambient one that lifts it.
 *
 * Dark shadows are deeper and more opaque, and they are only half of dark
 * elevation: the other half is `colors.overlay` being lighter than
 * `colors.surface`. Never a border and a shadow on the same edge (ui.md).
 */
const elevation = {
  light: {
    flat: 'none',
    raised: '0 1px 2px 0 rgb(18 17 17 / 0.06), 0 1px 3px 0 rgb(18 17 17 / 0.06)',
    overlay: '0 4px 8px -2px rgb(18 17 17 / 0.08), 0 12px 24px -6px rgb(18 17 17 / 0.12)',
    modal: '0 8px 16px -4px rgb(18 17 17 / 0.12), 0 24px 56px -12px rgb(18 17 17 / 0.3)',
  },
  dark: {
    flat: 'none',
    raised: '0 1px 2px 0 rgb(0 0 0 / 0.5), 0 1px 3px 0 rgb(0 0 0 / 0.4)',
    overlay: '0 4px 8px -2px rgb(0 0 0 / 0.5), 0 12px 24px -6px rgb(0 0 0 / 0.55)',
    modal: '0 8px 16px -4px rgb(0 0 0 / 0.55), 0 24px 56px -12px rgb(0 0 0 / 0.7)',
  },
} as const;

/**
 * Stacking layers. A `z-index` literal in a component is a bug: two things
 * that overlap wrongly are fixed by ordering or structure, not a bigger
 * number. Elevation implies z-order — anything that looks higher must also be
 * higher, which is why these names mirror `elevation`.
 *
 * `raised`, `raised-2` and `raised-3` are the steps the chapter-01 list did
 * not name: local stacking inside a single component (a link over a photo, a
 * badge over the link, a button over both) that must not compete with the
 * page-level layers. They top out at 3 so they can never outrank `sticky`,
 * and a component that needs a fourth has a structure problem, not a number
 * problem.
 */
const layers = {
  base: 0,
  raised: 1,
  'raised-2': 2,
  'raised-3': 3,
  sticky: 10,
  dropdown: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
  debug: 90,
} as const;

/**
 * Motion — durations in ms, easings as cubic-bezier control points, springs
 * as framer-motion's own parameters, distances in px (chapter 05).
 *
 * `sweep` and `decelerate` are the signature button fill: long enough to read
 * as a fill rather than a flick, decelerating so it settles instead of
 * slamming. They are here, not in globals.css, so that "refine the motion
 * language" is one edit. Nothing here is animated with `left`/`top`/`width`;
 * motion moves transform and opacity only.
 *
 * Under `prefers-reduced-motion` every duration collapses (globals.css), and
 * the information the motion carried survives as a state change.
 */
const motion = {
  duration: { instant: 80, fast: 140, normal: 220, slow: 320, sweep: 420 },
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.2, 0, 0, 1.2],
    exit: [0.4, 0, 1, 1],
    decelerate: [0.22, 0.61, 0.36, 1],
    /**
     * A strong ease-out: most of the travel in the first third, then a long
     * quiet settle. Measured off the reference reel's elements arriving (each
     * covered 60% of its distance in 100ms and was within 1px of rest by
     * 600ms), which is `cubic-bezier(0.16, 1, 0.3, 1)`. Entrances and
     * re-centring use it; it never overshoots.
     */
    settle: [0.16, 1, 0.3, 1],
  },
  spring: {
    snappy: { stiffness: 400, damping: 32 },
    soft: { stiffness: 260, damping: 30 },
    gentle: { stiffness: 180, damping: 26 },
  },
  /**
   * `nudge` is the amplitude of the error attention shake: a quarter of `small`'s travel each way.
   * `lift` is how far a card rises under a pointer (CRD-6): twice `micro`, enough to read as
   * "this will take my hand" with the shadow step, and half of `small`, so a grid of cards never
   * jumps.
   */
  distance: { micro: 2, small: 8, medium: 24, large: 64, nudge: 4, lift: 4 },
  /**
   * Scale endpoints. A press compresses to 98%; a card or notice arriving starts at 97%;
   * a mark too small for 97% to read (a chart point, a badge dot) starts at 60%.
   */
  scale: { press: 0.98, arrive: 0.97, pop: 0.6 },
  /**
   * How fast moving text may travel while someone reads it, in px per second. Used where
   * a truncated line is scrolled to show its end on hover or focus: slow enough to follow
   * with the eye, fast enough that a 240px overflow is one pass of 5 seconds. The two
   * reference reels that did this ran at 23 and 80; this sits between them.
   */
  speed: { read: 48 },
  /**
   * Orchestration (MOT-6): each child starts `step` ms after the one before it,
   * and only the first `steps` children are staggered; the rest arrive with the
   * last. The cap is what stops a 200-row table from animating. `fine` is the
   * step for a grid of peers that are small and many (product cards, CRD-6): half of
   * `step`, so four of them still finish inside 160 ms.
   */
  stagger: { step: 80, steps: 4, fine: 40 },
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
// Safeguards
//
// How much a person is made to do, or made to wait, before something that cannot
// be taken back happens (DNG-1, DNG-6). Starting values, in the same sense as the
// commerce defaults: a deployment retunes them here, and a later settings row can
// override them per tenant without a new rule.
// ---------------------------------------------------------------------------

const safeguards = {
  /**
   * How long a destructive control is held before it fires, in ms. Long enough
   * that a stray press or a tap with a thumb cannot do it (a long-press on a
   * phone is about 500), short enough that a person who means it is not made to
   * wait: a second is the least a ring can fill in and still be seen filling.
   */
  holdToConfirmMs: 1000,
  /**
   * How many days a removed workspace, brand or account stays recoverable
   * before it is purged. Two weeks spans two weekends and a month-end close,
   * which is when somebody notices what is missing.
   */
  deletionCooldownDays: 14,
} as const;

// ---------------------------------------------------------------------------
// Feedback
//
// How long a control's own answer stays on screen before the control is ready
// again (CPY-2, CPY-5), and how long a toast stays (SUC-3). Starting values: a
// deployment retunes them here.
// ---------------------------------------------------------------------------

const feedback = {
  /**
   * How long a copy button shows its check, in ms. Long enough for the eye to
   * come back from the place the value will be pasted and find the answer
   * still there (a glance away and back is about a second), short enough that
   * the icon is a copy button again before a second copy is wanted.
   */
  copiedHoldMs: 2000,
  /**
   * How long a copy button shows that the copy failed, in ms. Twice the success
   * hold: the failure carries a sentence the person has to read and act on
   * (select the text and copy it by hand), where success carries one glyph.
   */
  copyFailedHoldMs: 4000,
  /**
   * How long a toast, and the upload tray after everything succeeded, stays
   * before it leaves on its own, in ms. A toast is one sentence (about twelve
   * words, read in two to three seconds) plus the second it takes to notice it
   * arrived; the same four seconds as a copy failure, which also carries a
   * sentence. A toast with `duration: 0` stays until dismissed, and a failure
   * never hides on this timer.
   */
  toastMs: 4000,
} as const;

// ---------------------------------------------------------------------------

export const BRAND = {
  identity,
  contact,
  socials,
  legal,
  banking,
  locale,
  theme: { colors, colorsDark, radii, type, fonts, space, size, elevation, layers, motion },
  assets,
  commerce,
  safeguards,
  feedback,
} as const;

export type Brand = typeof BRAND;
