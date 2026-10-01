import { BRAND } from './brand';
import { cubicBezier, ms } from './theme-motion';
import { SIZE_SPACING_PX } from './theme-size';
import { spaceRem } from './theme-space';

/**
 * The Tailwind side of the theme — plain data, no Tailwind import.
 *
 * `packages/shared` has no dependency on Tailwind and must not gain one: the
 * POS and mobile read the same tokens and neither uses it. So this returns
 * the pieces (`colors`, `boxShadow`, `baseStyles`, …) and each app's
 * `tailwind.config.ts` drops them into its own config. The one thing the
 * builder cannot know is Tailwind's stock hue scales, so the app passes the
 * four it actually uses.
 *
 * HOW A THEME WORKS. Every colour utility resolves to a CSS custom property
 * holding an `r g b` triplet (`rgb(var(--color-neutral-50) / <alpha-value>)`),
 * so `text-neutral-900/60` keeps working. `:root` declares the light values;
 * `[data-theme='dark']` re-declares the same names. Nothing in a component
 * says which theme it is in — 1,700 existing `text-neutral-*` / `border-…` /
 * `bg-neutral-*` call sites flipped without being touched.
 *
 * WHY THERE ARE TWO RESOLUTIONS OF ONE NAME. `bg-accent` and `text-accent`
 * cannot be one colour in dark: a fill has to stay dark enough for its white
 * label (white-on-fill ≥ 4.5:1) and an ink has to be light enough to read on a
 * dark surface (≥ 4.5:1). No single teal does both — the gap between "dark
 * enough for white" and "light enough for dark" is empty. So:
 *
 *   `colors`           ink  — text, border, ring, divide, fill, stroke
 *   `backgroundColor`  fill — `bg-*`, where a label sits on top
 *
 * The same split covers `red/green/amber/blue`: a tint (`bg-red-50`) is a dark
 * wash in dark, and a solid (`bg-red-600 text-white`) keeps its stock value.
 * `bg-white` is the surface; `text-white` is the fixed label colour.
 */

type Hex = string;
type Scale = Readonly<Record<string, Hex>>;

/** The shape Tailwind's `addBase` takes, restated so shared needs no Tailwind types. */
export interface CssRules {
  [selector: string]: string | string[] | CssRules;
}

/** The stock Tailwind scales this product uses, passed in by the app. */
export interface StockHues {
  readonly red: Scale;
  readonly green: Scale;
  readonly amber: Scale;
  readonly blue: Scale;
}

export const STOCK_HUE_NAMES = ['red', 'green', 'amber', 'blue'] as const;
export type StockHueName = (typeof STOCK_HUE_NAMES)[number];

const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const;
const NEUTRAL_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;

/** Steps at or below this are tints (washes and hairlines); above it are solids and ink. */
const TINT_STEPS = ['50', '100', '200', '300'] as const;

/**
 * How much of a hue's 500 is mixed into the dark surface to make each tint.
 *
 * 10/16/26/40 %: the lightest wash has to read as "tinted" on a near-black
 * card without glowing (above ~16% a red notice starts to look like an alarm
 * lamp), and the 200 step is what `border-red-200` draws as a hairline, which
 * wants to be clearly there against its own 50 wash (26 vs 10). Checked, with
 * every text step, by `theme-contrast.spec.ts`.
 */
const TINT_MIX: Readonly<Record<(typeof TINT_STEPS)[number], number>> = {
  '50': 0.1,
  '100': 0.16,
  '200': 0.26,
  '300': 0.4,
};

/* ── colour maths ──────────────────────────────────────────────────────── */

export function hexToRgb(hex: Hex): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex([r, g, b]: readonly [number, number, number]): Hex {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** `fg` over `bg` at `alpha`, as an opaque hex. */
export function mixHex(fg: Hex, bg: Hex, alpha: number): Hex {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  return rgbToHex(a.map((v, i) => v * alpha + b[i]! * (1 - alpha)) as [number, number, number]);
}

/** `#0e8294` -> `'14 130 148'`, the form `rgb(var(--x) / <alpha-value>)` needs. */
export function channels(hex: Hex): string {
  return hexToRgb(hex).join(' ');
}

/* ── the dark half of a stock hue ──────────────────────────────────────── */

/**
 * A stock hue scale, re-derived for a dark surface.
 *
 * Tints (50–300) are the hue's 500 mixed into the surface — a wash, not a
 * neon. Everything from 400 up is ink (text, a line) and is pulled from the
 * LIGHT end of the scale so it reads on dark: what light writes as
 * `text-red-700` (a deep red on a pale wash) becomes red-300 on a dark red
 * wash. Lightness is reversed; the hue is not (COL-5).
 *
 * 400/500/600 all land on the stock 400 — in light they are three emphases of
 * one red, in dark the only emphasis left is "readable", and 400 clears 4.5:1
 * on every dark surface for all four hues.
 */
export function darkHueScale(stock: Scale, surface: Hex): Record<string, Hex> {
  const out: Record<string, Hex> = {};
  for (const step of TINT_STEPS) out[step] = mixHex(stock['500']!, surface, TINT_MIX[step]);
  out['400'] = stock['400']!;
  out['500'] = stock['400']!;
  out['600'] = stock['400']!;
  out['700'] = stock['300']!;
  out['800'] = stock['200']!;
  out['900'] = stock['100']!;
  out['950'] = stock['50']!;
  return out;
}

/* ── custom properties ─────────────────────────────────────────────────── */

const ref = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

/**
 * A theme colour as a plain CSS value, for the places a class cannot reach: an
 * SVG `stroke`, a Recharts tick, an inline style. It resolves through the same
 * custom property the utilities do, so a chart repaints the instant the theme
 * changes — no hook, no re-render, no second copy of the palette in JS.
 *
 * `themeColorVar('neutral-900', 0.6)` -> `rgb(var(--color-neutral-900) / 0.6)`.
 */
export function themeColorVar(name: string, alpha?: number): string {
  return alpha === undefined ? `rgb(var(--color-${name}))` : `rgb(var(--color-${name}) / ${alpha})`;
}

type Vars = Record<string, string>;

function neutralVars(neutral: Scale): Vars {
  const vars: Vars = {};
  for (const step of NEUTRAL_STEPS) vars[`--color-neutral-${step}`] = channels(neutral[step]!);
  return vars;
}

function hueVars(name: StockHueName, scale: Scale): Vars {
  const vars: Vars = {};
  for (const step of STEPS) vars[`--color-${name}-${step}`] = channels(scale[step]!);
  return vars;
}

/**
 * Every custom property that changes between themes: the colours, and the
 * shadows (which are colours too). Declared at `:root`, at
 * `[data-theme='light']` and at `[data-theme='dark']`, so a region can pin
 * itself to one theme whatever the page is in.
 */
export function themeVars(theme: 'light' | 'dark', stock: StockHues): Vars {
  const c = theme === 'light' ? BRAND.theme.colors : BRAND.theme.colorsDark;
  const elevation = BRAND.theme.elevation[theme];
  // Light has no `accentInk`: fill and ink are one colour there, which is why
  // the token only exists for dark (see brand.ts).
  const accentInk = theme === 'light' ? BRAND.theme.colors.accent : BRAND.theme.colorsDark.accentInk;

  const vars: Vars = {
    ...neutralVars(c.neutral),
    '--color-surface': channels(c.surface),
    '--color-overlay': channels(c.overlay),
    '--color-inverse': channels(c.inverse),
    '--color-on-inverse': channels(c.onInverse),
    '--color-scrim': channels(c.scrim),
    '--color-accent-ink': channels(accentInk.DEFAULT),
    '--color-accent-ink-hover': channels(accentInk.hover),
    '--color-feedback-positive': channels(c.feedback.positive),
    '--color-feedback-negative': channels(c.feedback.negative),
    ...Object.fromEntries(c.chart.map((hex, i) => [`--color-chart-${i}`, channels(hex)])),
    '--shadow-flat': elevation.flat,
    '--shadow-raised': elevation.raised,
    '--shadow-overlay': elevation.overlay,
    '--shadow-modal': elevation.modal,
  };

  for (const hue of STOCK_HUE_NAMES) {
    Object.assign(vars, hueVars(hue, theme === 'light' ? stock[hue] : darkHueScale(stock[hue], c.surface)));
  }
  return vars;
}

/** Custom properties that do not change between themes: motion. */
export function staticVars(): Vars {
  const m = BRAND.theme.motion;
  const vars: Vars = {};
  for (const [name, value] of Object.entries(m.duration)) vars[`--motion-duration-${name}`] = ms(value);
  for (const [name, points] of Object.entries(m.easing)) vars[`--motion-easing-${name}`] = cubicBezier(points);
  for (const [name, px] of Object.entries(m.distance)) vars[`--motion-distance-${name}`] = `${px}px`;
  for (const [name, value] of Object.entries(m.scale)) vars[`--motion-scale-${name}`] = String(value);
  vars['--motion-stagger-step'] = ms(m.stagger.step);
  return vars;
}

/* ── the Tailwind pieces ───────────────────────────────────────────────── */

function inkHue(name: StockHueName): Record<string, string> {
  return Object.fromEntries(STEPS.map((step) => [step, ref(`${name}-${step}`)]));
}

/** `bg-*` for a stock hue: washes follow the theme, solids keep their stock value. */
function fillHue(name: StockHueName, stock: Scale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const step of STEPS) {
    out[step] = (TINT_STEPS as readonly string[]).includes(step) ? ref(`${name}-${step}`) : stock[step]!;
  }
  return out;
}

export function createThemeTailwind(stock: StockHues) {
  const t = BRAND.theme;
  const light = t.colors;
  // `black` is deliberately absent: an absolute black fill is `scrim` (a veil) or
  // `inverse` (a fill that flips), and a literal one would not flip with the theme.
  const fixed = { white: light.white } as const;

  const neutral = Object.fromEntries(NEUTRAL_STEPS.map((s) => [s, ref(`neutral-${s}`)]));

  return {
    /**
     * REPLACES `theme.colors` (not `extend`). The palette is closed on
     * purpose: a stock hue that is not listed here has no dark value, so
     * `text-orange-600` would be correct in light and wrong in dark with no
     * error anywhere. Unlisted, it generates no CSS — a visible bug instead
     * of a silent one, and the "no second palette" rule enforced by the build.
     */
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      ...fixed,
      neutral,
      accent: { DEFAULT: ref('accent-ink'), hover: ref('accent-ink-hover') },
      star: light.star,
      feedback: { positive: ref('feedback-positive'), negative: ref('feedback-negative') },
      surface: ref('surface'),
      overlay: ref('overlay'),
      inverse: ref('inverse'),
      'on-inverse': ref('on-inverse'),
      scrim: ref('scrim'),
      red: inkHue('red'),
      green: inkHue('green'),
      amber: inkHue('amber'),
      blue: inkHue('blue'),
    },

    /** Merged into `theme.extend`: where a fill differs from an ink. */
    backgroundColor: {
      white: ref('surface'),
      accent: { DEFAULT: light.accent.DEFAULT, hover: light.accent.hover },
      red: fillHue('red', stock.red),
      green: fillHue('green', stock.green),
      amber: fillHue('amber', stock.amber),
      blue: fillHue('blue', stock.blue),
    },
    /**
     * A bare `border` (no colour class) is the hairline, `neutral-100`: the
     * closed palette has no `gray-200` for Tailwind's preflight to default to,
     * so without this every bare border would paint in the text colour.
     * A white border is the surface showing through (an avatar ringed against a
     * photo), not a label.
     */
    borderColor: { DEFAULT: ref('neutral-100'), white: ref('surface') },
    /** The skeleton shimmer fades to the surface, not to paper. */
    gradientColorStops: { white: ref('surface') },

    /**
     * The stock shadow names map onto the four elevation steps, so the 56
     * existing `shadow` call sites are on the system without being edited.
     */
    boxShadow: {
      none: 'none',
      sm: 'var(--shadow-raised)',
      DEFAULT: 'var(--shadow-raised)',
      md: 'var(--shadow-overlay)',
      lg: 'var(--shadow-overlay)',
      xl: 'var(--shadow-modal)',
      '2xl': 'var(--shadow-modal)',
      flat: 'var(--shadow-flat)',
      raised: 'var(--shadow-raised)',
      overlay: 'var(--shadow-overlay)',
      modal: 'var(--shadow-modal)',
    },

    /** REPLACES `theme.zIndex`: a numeric `z-50` is a bug, so it stops existing. */
    zIndex: { auto: 'auto', ...Object.fromEntries(Object.entries(t.layers).map(([k, v]) => [k, String(v)])) },

    /** Merged into `theme.extend.spacing`: `h-control-md`, `min-h-touch`. */
    spacing: Object.fromEntries(Object.entries(SIZE_SPACING_PX).map(([k, px]) => [k, spaceRem(px)])),

    /** Merged into `theme.extend.transitionDuration`. */
    transitionDuration: {
      /*
       * A bare `transition-colors` resolves to `DEFAULT`. Tailwind's stock 150ms is a
       * number nobody chose, so the default is `fast` and every un-tokened
       * transition in the app joins the language without a call-site edit.
       */
      DEFAULT: ms(t.motion.duration.fast),
      ...Object.fromEntries(Object.entries(t.motion.duration).map(([k, v]) => [k, ms(v)])),
    },
    /** Merged into `theme.extend.transitionTimingFunction`. */
    transitionTimingFunction: {
      DEFAULT: cubicBezier(t.motion.easing.standard),
      ...Object.fromEntries(Object.entries(t.motion.easing).map(([k, v]) => [k, cubicBezier(v)])),
    },

    /**
     * Handed to Tailwind's `addBase`. Three scopes declare the theme-varying
     * properties: `:root` (light by default), `[data-theme='light']` and
     * `[data-theme='dark']` (an explicit choice, or a pinned region). The media
     * query is the no-JavaScript fallback: with no `data-theme` attribute at
     * all, the OS preference decides.
     */
    baseStyles(): CssRules {
      const lightVars = themeVars('light', stock);
      const darkVars = themeVars('dark', stock);
      return {
        ':root': { 'color-scheme': 'light', ...staticVars(), ...lightVars },
        "[data-theme='light']": { 'color-scheme': 'light', ...lightVars },
        "[data-theme='dark']": { 'color-scheme': 'dark', ...darkVars },
        '@media (prefers-color-scheme: dark)': {
          ':root:not([data-theme])': { 'color-scheme': 'dark', ...darkVars },
        },
      };
    },
  };
}
