import { BRAND } from './brand';
import { compositeRgb, contrastRatio, contrastRatioHex, relativeLuminance, wcagLevel } from './theme-contrast';
import { accentGlow, darkHueScale, hexToRgb, mixHex, STOCK_HUE_NAMES, TONE_NAMES, TONE_WASH_MIX, type StockHues } from './theme-tailwind';

/**
 * The dark palette is held to numbers, not to taste (COL-3, COL-5).
 *
 * `scripts/check-contrast.mjs` scans the source for colour pairs that are
 * actually written out; this spec checks the ROLES — every pairing the palette
 * permits by design — so a value edited in brand.ts fails here before any
 * screen is drawn. Both run in `pnpm lint` / `pnpm test`.
 */

// Tailwind 3.4's own scales, copied as fixtures: packages/shared has no
// Tailwind dependency (and must not gain one), so the spec cannot import them.
const STOCK: StockHues = {
  red: { '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5', '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c', '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a' },
  green: { '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac', '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d', '800': '#166534', '900': '#14532d', '950': '#052e16' },
  amber: { '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d', '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309', '800': '#92400e', '900': '#78350f', '950': '#451a03' },
  blue: { '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd', '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#1e3a8a', '950': '#172554' },
};

const luminance = (hex: string): number => relativeLuminance(hexToRgb(hex));
const contrast = contrastRatioHex;

describe('contrast maths', () => {
  it('matches the published WCAG vectors', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
  });

  it('labels a ratio by the conformance level it reaches', () => {
    expect(wcagLevel(7.5)).toBe('AAA');
    expect(wcagLevel(4.6)).toBe('AA');
    expect(wcagLevel(4.4)).toBe('fail');
    // Large text has the lower floors: 3:1 is AA, 4.5:1 is AAA.
    expect(wcagLevel(3.2, true)).toBe('AA');
    expect(wcagLevel(4.6, true)).toBe('AAA');
  });
});

describe.each([
  ['light', BRAND.theme.colors],
  ['dark', BRAND.theme.colorsDark],
] as const)('%s palette — the roles that exist in both themes', (_name, c) => {
  it('gives the label on the strongest fill 7:1 (AAA)', () => {
    expect(contrast(c.onInverse, c.inverse)).toBeGreaterThanOrEqual(7);
  });

  it('keeps a white label readable on the brand fill and its pressed shade', () => {
    expect(contrast(c.white, c.accent.DEFAULT)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.white, c.accent.hover)).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * A frosted surface (`bg-overlay/85 backdrop-blur-md`) over an image has no
   * contrast of its own: it depends on the pixel behind it. A blur averages its
   * neighbourhood, so the worst a backdrop can be is a flat black or a flat
   * white. Held to the text floor against both, so the claim "readable over any
   * picture" is a number and not a hope.
   */
  describe.each([['black', [0, 0, 0]], ['white', [255, 255, 255]]] as const)('frosted surface over a %s backdrop', (_label, pixel) => {
    const FROST = 0.85;
    const glass = compositeRgb(hexToRgb(c.overlay), pixel, FROST);

    it('keeps primary text at 4.5:1', () => {
      expect(contrastRatio(hexToRgb(c.neutral[900]), glass)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the secondary ramp (neutral-900 at 70%) at 4.5:1', () => {
      const secondary = compositeRgb(hexToRgb(c.neutral[900]), glass, 0.7);
      expect(contrastRatio(secondary, glass)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('never makes the scrim lighter than the page it dims', () => {
    expect(luminance(c.scrim)).toBeLessThan(luminance(c.neutral[50]) + 0.05);
    expect(luminance(c.scrim)).toBeLessThan(0.02);
  });
});

describe('dark palette', () => {
  const c = BRAND.theme.colorsDark;
  const surfaces = { page: c.neutral[50], surface: c.surface, overlay: c.overlay } as const;

  it('climbs: page < surface < overlay (a dark interface says "higher" by being lighter)', () => {
    expect(luminance(c.neutral[50])).toBeLessThan(luminance(c.surface));
    expect(luminance(c.surface)).toBeLessThan(luminance(c.overlay));
  });

  it('keeps the ramp monotonic — 50 is the darkest, 900 the lightest', () => {
    const steps = Object.values(c.neutral).map(luminance);
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
  });

  describe.each(Object.entries(surfaces))('text on the %s', (_label, bg) => {
    it.each([
      ['neutral-900, strong text', c.neutral[900]],
      ['neutral-700', c.neutral[700]],
      ['neutral-600, secondary text', c.neutral[600]],
      ['neutral-500, quiet text', c.neutral[500]],
      ['neutral-400, placeholder and icon', c.neutral[400]],
      ['accent ink, a link', c.accentInk.DEFAULT],
      ['accent ink hover', c.accentInk.hover],
      ['feedback positive', c.feedback.positive],
      ['feedback negative', c.feedback.negative],
    ])('%s reaches 4.5:1', (_what, fg) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });

    it('neutral-900 at 60% — the secondary-text ramp — reaches 4.5:1', () => {
      expect(contrast(mixHex(c.neutral[900], bg, 0.6), bg)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it.each([
    ['surface', c.surface],
    ['overlay', c.overlay],
  ])("a control's outline (neutral-200) reaches 3:1 on the %s", (_label, bg) => {
    expect(contrast(c.neutral[200], bg)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['positive', c.feedback.positive],
    ['negative', c.feedback.negative],
  ])('a %s notice — feedback ink on its own 10%% wash — reaches 4.5:1', (_which, fg) => {
    expect(contrast(fg, mixHex(fg, c.surface, 0.1))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every chart series 3:1 (the graphical-object floor) on surface and overlay', () => {
    for (const series of c.chart) {
      expect(contrast(series, c.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(series, c.overlay)).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the soft edge (neutral-100) visible against the surface it rules', () => {
    // 1.2:1 on purpose — the same hairline weight as light's 1.23:1. It
    // conveys nothing the spacing does not; a control's edge is neutral-200.
    expect(contrast(c.neutral[100], c.surface)).toBeGreaterThan(1.15);
  });
});

describe('dark stock hues — inverted in lightness, not in hue', () => {
  const surface = BRAND.theme.colorsDark.surface;

  describe.each(STOCK_HUE_NAMES)('%s', (hue) => {
    const dark = darkHueScale(STOCK[hue], surface);

    it('keeps text steps readable on the dark surface and on its own washes', () => {
      for (const step of ['600', '700', '800', '900']) {
        expect(contrast(dark[step]!, surface)).toBeGreaterThanOrEqual(4.5);
        for (const wash of ['50', '100']) expect(contrast(dark[step]!, dark[wash]!)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('draws a hairline (200) that is distinguishable from its 50 wash', () => {
      expect(contrast(dark['200']!, dark['50']!)).toBeGreaterThan(1.15);
    });

    it('orders the washes from faintest to strongest', () => {
      const lums = ['50', '100', '200', '300'].map((s) => luminance(dark[s]!));
      for (let i = 1; i < lums.length; i += 1) expect(lums[i]!).toBeGreaterThan(lums[i - 1]!);
    });
  });

  it('leaves solids at their stock value so white labels keep reading (bg-red-600 text-white)', () => {
    // backgroundColor keeps stock for 400+; that is only safe if they hold 4.5:1 with white today.
    for (const hue of ['red', 'green', 'blue'] as const) {
      expect(contrast('#ffffff', STOCK[hue]['600']!)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast('#ffffff', STOCK.red['600']!)).toBeGreaterThanOrEqual(4.5);
  });
});

/*
 * Tones (ADR-083, twelfth addendum): the colour an icon wears. Held to the floors that apply to a
 * graphical object, not to text: the glyph must read against its own wash (3:1, WCAG 1.4.11) and
 * against the surface and the page it sits on. The surface also gets the 4.5:1 text floor, because
 * a tone is used as a thin line or a small mark and the one mistake worth ruling out is a pale one.
 */
describe.each([
  ['light', BRAND.theme.colors],
  ['dark', BRAND.theme.colorsDark],
] as const)('%s tones', (theme, c) => {
  describe.each(TONE_NAMES)('%s', (name) => {
    const ink = c.tone[name];
    const wash = mixHex(ink, c.surface, TONE_WASH_MIX[theme]);

    it('keeps the glyph at 3:1 on its own wash', () => {
      expect(contrast(ink, wash)).toBeGreaterThanOrEqual(3);
    });

    it('keeps the glyph at 3:1 on the page and 4.5:1 on the surface', () => {
      expect(contrast(ink, c.neutral[50])).toBeGreaterThanOrEqual(3);
      expect(contrast(ink, c.surface)).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the wash a tint: it is lighter than the glyph in light and darker in dark, never the glyph itself', () => {
      expect(wash).not.toBe(ink);
      if (theme === 'light') expect(luminance(wash)).toBeGreaterThan(luminance(ink));
      else expect(luminance(wash)).toBeLessThan(luminance(ink));
    });
  });

  it('is seven different colours', () => {
    expect(new Set(TONE_NAMES.map((name) => c.tone[name].toLowerCase())).size).toBe(TONE_NAMES.length);
    expect(TONE_NAMES).toHaveLength(7);
  });
});

describe('the teal tone is the brand accent, so a rebrand moves it', () => {
  it('is the fill/ink of the light accent and the ink of the dark one', () => {
    expect(BRAND.theme.colors.tone.teal).toBe(BRAND.theme.colors.accent.DEFAULT);
    expect(BRAND.theme.colorsDark.tone.teal).toBe(BRAND.theme.colorsDark.accentInk.DEFAULT);
  });
});

describe('the accent glow', () => {
  it('is built from the accent fill, in two layers', () => {
    const glow = accentGlow(BRAND.theme.colors.accent.DEFAULT);
    expect(glow.split(/,(?![^(]*\))/)).toHaveLength(2);
    expect(glow).toContain('rgb(14 130 148 / 0.6)');
    expect(glow).toContain('rgb(14 130 148 / 0.4)');
  });
});
