# Yaseen — logo

The wordmark is locked. Everything in `logo/` is drawn from the one approved
artwork; nothing here is a variant to choose between.

## Files

| File | Use it for |
|---|---|
| `logo/yaseen-wordmark.svg` | The primary logo. Ink on light grounds. |
| `logo/yaseen-wordmark-reverse.svg` | Dark grounds — the noir-900 footer, photography. |
| `logo/yaseen-wordmark-currentcolor.svg` | Inline in JSX only, where it should follow the surrounding text colour. |
| `logo/yaseen-y.svg` | The `y` alone: avatars, buttons, a woven label, a stamped tag. |
| `logo/yaseen-app-icon.svg` | 64px and up — Expo icon, Android adaptive foreground, PWA tile, apple-touch-icon. |
| `logo/yaseen-favicon.svg` | 16px and 32px only. |

The `currentcolor` file has to be **inlined** — pulled in through `<img src>` or
`background-image` it renders black, because `currentColor` has nothing to
inherit in a standalone document. Use the ink or reverse file there instead.

## The artwork

All outlines, no live text: nothing depends on a font being installed, and the
logo cannot silently fall back to Arial the way a webfont wordmark can.

| | |
|---|---|
| Aspect | 1000 : 256.18 (3.903 : 1) — **locked** |
| Stroke weight | 29.2 units of the 1000-wide box |
| x-height | 168.7 units |
| Descender | 87.5 units below the baseline |

The six letters are a single continuous stroke — `a` runs into `s`, `s` into
`e`, and so on. That is the design, not an artefact, which is why the wordmark
cannot be re-set letter by letter or re-spaced.

The `y` in `yaseen-y.svg` is cut at the point where the `y`'s own stem edge
sits, so the cut edge belongs to the letter rather than slicing through the
`a`'s entry stroke.

Both icon files reverse the `y` out of an ink ground. A light monoline on ink
survives antialiasing at small sizes far better than the same line drawn in ink
on white. The favicon sets the `y` larger than the app icon does (48 of the 64
grid against 42) and drops the corner radius from 14 to 10 — a 22% radius
rounds away most of the square at 16px and leaves a blob in the tab strip.

## Colour

| | |
|---|---|
| Ink | `#121111` — `noir-900` |
| Reverse | `#FFFFFF` |

One colour, always. The logo has no second colour and no tinted state.

`#F5B841` is **not** available to it: `apps/web/tailwind.config.ts` reserves
that gold for rating stars and nothing else. The legacy teal `#1B9AAA` belongs
to the admin panel and is not part of the customer-facing identity.

## Clear space and minimum size

Clear space on all four sides is **half the x-height** — half the height of the
`n`. Nothing sets into that margin.

| | Minimum |
|---|---|
| Wordmark, screen | 90px wide |
| Wordmark, print | 24mm wide |
| `y` monogram | 24px |
| Below 32px | use `yaseen-favicon.svg` |

Below about 90px the counters in the `a` and the two `e`s start to close up.

## Don't

- Stretch it. Scale both axes together; the aspect is fixed.
- Recolour it, including to the reserved star gold.
- Add an outline, shadow, gradient or glow.
- Re-set the name in a typeface and call it the logo.
- Re-space or re-letter it — the stroke is continuous.
- Lay it over a busy image without a scrim behind it.

## Still open

- **Typeface licensing.** If the approved artwork was set in a licensed
  typeface, confirm the licence covers logo and trademark use before filing the
  mark or printing at scale. Outlines do not by themselves settle that.
- **Source artwork.** These outlines are traced from the approved raster,
  upscaled 3× and registered against the original with no visible drift. If the
  original vector — or the typeface it was set in — turns up, regenerating from
  it would be cleaner still.
- **Urdu.** The storefront runs English and Urdu at equal weight and there is no
  Urdu counterpart to this wordmark yet.
- **Nothing is wired up.** The storefront header and footer still render the
  site name as text, `apps/web/src/app/icon.svg` is still the old teal needle,
  and `apps/mobile/assets/` still holds the old PNGs.
