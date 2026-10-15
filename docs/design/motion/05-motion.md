# 05 · Motion

Motion exists to make the system easier to understand. Nothing else justifies
it.

> **Status: built for the web app.** The tokens (chapter 01) are consumed by the
> shared classes and primitives, so every page has the *functional* motion
> without opting in: press, fill, lift, a field's focus and its invalid shake,
> a notice arriving, a dialog and a toast entering and leaving, a page rising
> into place, a tab underline gliding, a loading ring. The *expressive* tier is
> opt-in and bounded (below). The specimens, each replayable, are in
> `/admin/design-system#motion`. **Not built:** `apps/mobile` (React Native; its
> animation library is installed and unused), press feedback on the POS (it needs
> its own distance and scale tokens, because a till button is larger and a
> gloved finger needs more), springs and shared-layout transitions (no consumer;
> `framer-motion` is still imported by one file). Where this chapter and the
> code disagree, the code is measured in `docs/index/cross/design-system.md`.

## The one test

> **If all animation were removed, would this still be an excellent interface?**

If no — fix the interface. Motion is not a remedy for weak hierarchy, a
crowded page, or an unclear primary action. Adding movement to a page that
does not work yet produces a page that does not work and moves.

Then:

> **If the animation were removed, would the user lose information about
> state, hierarchy, continuity or causation?**

If no, the animation is decoration. Remove it.

## What motion may communicate

Every transition must answer *what does this movement tell the user?* The
legitimate answers, and there are not many:

- **Causation** — this happened because you did that
- **Continuity** — this is the same object, changed, not a new one
- **Hierarchy** — this belongs to that
- **Spatial relationship** — this came from there, and will go back
- **State change** — it is now loading, now done
- **Attention** — look here, because something needs you

"It looks impressive" is not on the list. This product is infrastructure; its
motion should read as precision, not performance.

## The language

Values are tokens, specified in [Chapter 01](../foundations/01-foundations.md). A duration
written into a component is the thing the token layer exists to prevent.

| Purpose | Token |
|---|---|
| Presence and absence | opacity, `duration.fast` |
| Movement | transform, `easing.standard` |
| Structural change | layout animation, `duration.normal` |
| Same object, new place | shared-layout (`layoutId`), `spring.snappy` |
| Physical response | spring, not duration |
| Exit | `easing.exit` — leaving is faster than arriving |

**Springs for things that move; durations for things that change.** A panel
sliding is physical and takes a spring. A colour changing is not physical and
takes a duration.

## Hierarchy of motion

Intensity follows information hierarchy. Most motion in a business interface
belongs at level 3.

| Level | What | Treatment |
|---|---|---|
| 1 · Critical | workflow completion, confirmation, major state change | strongest, still under `duration.slow` |
| 2 · Important | opening a panel, changing a filter, selecting a record | `duration.normal`, `distance.medium` |
| 3 · Supporting | hover, focus, tooltip, secondary control | `duration.fast`, `distance.micro`–`small` |
| 4 · Decorative | — | **remove it** |

**Distance follows conceptual distance.** A press moves 2px because pressing
is a small idea. A route change may move 64px because arriving somewhere else
is a large one. An element travelling a long way for a small interaction feels
untrustworthy.

## The reel, and the two tiers

The motion in a reference reel the owner supplied (fourteen motions, measured
frame by frame) was read for *what each one tells the reader*, not for how it
looks, and sorted into two tiers. The reel's palette, type and hexagon were not
copied.

**Functional** motion is what the controls themselves do. It is on by default,
on every surface that uses the shared classes and primitives, and it never takes
longer than `slow` (320 ms). It uses transform and opacity only (`MOT-5`).

**Expressive** motion marks a moment the product has: a figure that was just
computed, the one thing being worked on, a value the system just produced. It is
opt-in, one purpose each, each with a stated place, and it never gates anything:
the settled state is what the server renders and what a screen reader hears.

| Motion in the reel | What it says | Here | Tier |
|---|---|---|---|
| Zoom-blur arrive | this is new | `arrive` (opacity, 8px, 3% scale; **no blur**) on cards, dialogs, popovers, notices, toasts | Functional |
| Directional smear between scenes | you went somewhere | `PageEnter` on admin and storefront | Functional |
| Pill cascade from the edge | these belong together, in order | 80 ms stagger capped at four steps (`.stagger`, `RevealScope`); a side sheet from its own edge | Functional |
| Staggered cards in, blur out | a board assembling where you look | `RevealScope` on `Bento`; one `leave` for every exit | Functional |
| Glow bloom | this control has your attention | the focus ring eases in on fields and controls | Functional |
| Clock-hand sweep | working, or running out | `.spinner` on buttons and `Loading`; the draining line on a toast | Functional |
| Press and release (not in the reel) | your click landed, this frame | `.btn`, `.chip`, `.icon-btn`, `Segmented`, `.lift` (returns to rest) | Functional |
| Counter ring with count-up | how much, and just computed | `ProgressRing`, `CountUp` | Expressive |
| Lock-on corner brackets | this is the one | `.focus-frame` | Expressive |
| Text scramble decode | the system just produced this | `ScrambleText` | Expressive |
| Typewriter | something is being said | `TypeText`, up to 80 characters | Expressive |
| Draw-on ring with dimmed siblings | look here, not there | the ring draws on; **siblings are not dimmed** (it drops their text under the contrast floor, `COL-3`) | Partly |
| Hexagon pop with a leader line | nothing the product has to say | not adopted | — |
| Floating particles, ambient arcs | nothing | not adopted (`Law 6`) | — |

The reel runs its entrances for about 600 ms. That is a film. A component here
takes at most `slow` (320 ms); `sweep` (420 ms) is for a page-level figure
resolving and the button fill.

### The third tier: ambient (twelfth addendum)

The owner, 2026-10-09: "Add maximum motion effects, maximum premium motion
animations", and "give the liveness to this project, give a soul to this project".
Two tiers were not enough to say that, so there is a third.

**Ambient** motion is what a screen does while nobody is touching it, and it is
allowed only where the thing is itself *alive*: updating now, or running out. It
passes the one test like every other motion (it carries state or attention), and
it is held to four limits that the other tiers do not need:

- **It has its own clock**, `motion.ambient`: `pulse` 2 000 ms and `breathe`
  3 600 ms. They are slower than any interaction on purpose, so the 420 ms
  interaction ceiling is untouched and an ambient loop never reads as a response
  to the reader's own act.
- **Transform and opacity only** (`MOT-5`). The live dot's ring and the breathing
  halo are pseudo-elements that scale and fade; the element they sit on never
  moves.
- **One of each per screen at most.** A page of thirty pulsing dots is noise;
  the dot says "this figure is live" once, at the figure.
- **Under reduced motion it stops, and loses nothing.** The global rule ends every
  loop after one frame at its end state: the ring is invisible and the dot alone
  says "live"; the halo is invisible and the badge's words say "closing soon".

| Motion | What it says | Where | Tier |
|---|---|---|---|
| `.live-dot` (ring leaves the dot every 2 s) | this figure is updating now | the lot's price, the lot card's time left | Ambient |
| `.breathe` (a 5 px halo swells and fades every 3.6 s) | look here, this is running out | the closing-soon badge, one per screen | Ambient |
| `.btn-primary` shine (one highlight, `sweep`, on hover) | this is the one action | the primary button only | Functional |
| `.lift.tilt` (leans at most 4° toward a fine pointer, through 900 px of perspective) | this surface is under your hand | a card that is a link to a thing (launchpad tile, lot card) | Functional |
| `.icon-tile` tip (rises 2 px, grows 6%, leans 3°, takes a glow in its own tone) | this is what you are about to open | a tile inside a hovered or focused card, link or row | Functional |
| `.nav-rail` (a 3 px bar grows from its centre) | you arrived here | the active row of the admin sidebar | Functional |
| `.tone-hover` (the glyph takes its tone) | this icon is the one in use | a bare storefront icon control | Functional |
| `CountUp mode="reel"` on a price | this figure was just computed | the lot's current bid | Expressive |

Hover and focus things are gated by `(hover: hover) and (pointer: fine)` and
`prefers-reduced-motion: no-preference` together: a finger has no hover, so
nothing leans or tips on a phone. Still not adopted: particles, drifting
gradients, parallax, anything that moves on a business control (no bounce, no
elastic: the rejection list below still stands).

### The functional vocabulary

| Motion | What moves | Token values |
|---|---|---|
| Press | `translateY` 2px and `scale` 0.98 | `distance.micro`, `scale.press`; down in `instant`, back in `fast`, `settle` |
| Arrive | opacity 0 to 1, 8px up, scale 0.97 to 1 | `distance.small`, `scale.arrive`, `normal`, `settle`; `backwards` fill |
| Leave | opacity 1 to 0, scale to 0.97 | `scale.arrive`, `fast`, `exit`; `forwards` fill |
| Nudge | `translateX` 0, -4, +4, -2, +1, 0 px | `distance.nudge`, `slow`, `standard`; once, ends where it began |
| Side sheet | 64px along the inline axis and a fade, direction flips in a right-to-left document | `distance.large`, `slow` in, `fast` out |
| Stagger | `animation-delay` 0, 80, 160, 240, then 320 ms | `stagger.step`, `stagger.steps`; total ≤ `slow` (pinned by a test) |
| Lift | `translateY` -4px, back to 0 when pressed | `distance.nudge`, `slow`, `settle` |

`settle` is `cubic-bezier(0.16, 1, 0.3, 1)`, measured off the reel. It leaves
quickly and finishes slowly, and it never overshoots: `emphasized` (y2 = 1.2)
does, and is not used by any business control. A test pins that `settle` stays
at or under 1.

### The seven further reels

Seven more reels were read the same way, motion by motion, for what each tells the
reader. Most of what they showed was already here (arrive, stagger, the text decode
and type, the loading ring, press, the count-up, draw-on, reveal on scroll). What was
new, and fits the caps, is below. The values are tokens (chapter 01); the ones this
round added are `scale.pop` (0.6) and `speed.read` (48 px/s).

| Motion in the reels | What it says | Here | Tier |
|---|---|---|---|
| Highlight sweep across a changed value | this just changed | `.sheen` with `data-fresh`, driven by `useFreshOnChange`: a dashboard tile whose figure changes with the range, a new row in the activity feed. One pass, `sweep`, `decelerate`, accent ink at 14%; never ambient | Functional |
| A label that hands over in place | the same thing, now different | `SwapText` in `StatusBadge`: the old one rises out 4px over `fast`, the new one rises in 4px over `normal` | Functional |
| Progress bars: head, complete, failed, LED cells | how much of the whole, and how it ended | `ProgressBar` (`tone`, `head`, `segmented`): the Reports ranking, the Stitching tailor load (negative past capacity) | Functional |
| A label that scrolls to show its end | there is more, and here it is | `TruncateReveal` on hover: a 220 ms beat, then linear at `speed.read`, never over five seconds; the full text stays in `title` | Functional |
| Step comes from the way you are going | you moved forward, or back | `Wizard`: `.step-forward` rises into place, `.step-back` drops into place; the opening step does not animate | Functional |
| Popup opens out of its trigger | this came from there | `Dialog`: `.arrive-from` from the offset between the trigger's centre and the panel's, each axis held to `distance.large` | Functional |
| Error outline that flashes once | something is wrong, here | `.ignite`: a 2px inset ring in the negative colour fading over `slow`; on announced error notices and error toasts | Functional |
| Badge that pops when its count changes | the number changed | `.pop`: from `scale.pop`, `fast`, `settle`; the cart count, keyed by the count | Functional |
| Charts that draw, then answer the pointer | data being plotted; this is the point you are on | every chart: draw-on over `sweep` on `settle`, series `staggerDelayMs` apart, markers pop as the line reaches them, a crosshair or band follows the pointer, the tooltip glides over `normal`, a donut slice gets a halo | Expressive |
| Icon strokes that draw themselves | this just happened | `DrawIcon`: the confirmation tick on verify-email and unsubscribe | Expressive |
| Odometer digits | the one figure that matters, resolving | `CountUp mode="reel"`: net profit on the P&L page | Expressive |
| Words appear one by one | a sentence being said | `TypeText unit="word"` (no product screen yet) | Expressive |
| Playhead scrubbing a timeline | nothing here | not adopted: there is no timeline view | — |
| Icon that wipes open to its label | nothing a label does not say | not adopted: a `clip-path` animation is paint, not transform or opacity (`MOT-5`) | — |
| Bounce, overshoot, tilt, camera zoom, glow, blur, particles, brand-gradient watermarks | nothing | not adopted | — |

Two exceptions to the 320 ms cap, both stated where they are used. A chart entrance
is a page-level figure and takes `sweep` (420 ms); with the stagger the fourth series
starts at 240 ms and ends at 660 ms. A truncated label scrolls at a reading speed, so
its length follows the text (to a 5 s ceiling) and it runs only under the pointer.
`ProgressBar` also follows real progress rather than a clock: between two samples it
eases over `normal`.

How the new ones are built, so they stay inside the rules:

- The sheen is a gradient on a pseudo-element translated across the box; the box
  must clip it (`overflow-hidden`, which `.sheen` sets).
- `ProgressBar` slides a full-width fill by `translateX` (a `scaleX` would turn the
  rounded end into an ellipse) and reads one custom property, `--p`; the head knob
  uses the wrapper's own width (`cqw`) so there is no layout read.
- `.reel-digit` is `inline-flex` with `overflow: clip` so its baseline is the first
  digit's, and the digits sit on the baseline of the text around them.
- `Dialog` reads the focused control's rectangle in a layout effect, before the
  first paint and before the animation has moved the panel, so both rectangles are at
  rest. With nothing focused it falls back to `arrive` (`small` below).
- `DrawIcon` marks the strokes of a lucide icon on the client (`pathLength="1"`,
  `.draw-path`); the server and a no-script page show the icon drawn.

### The control cards

The owner's rule cards of 2026-10-01 (`03-components.md`, "Controls with a
contract") asked for motion in six places. Each is a motion that carries a fact,
and each is built on tokens that already existed or on the two this round added
(`distance.lift`, `stagger.fine`).

| Motion on the cards | What it says | Here | Tier |
|---|---|---|---|
| A ring that fills while a danger button is held | this will not happen by accident, and how far along it is | `HoldToConfirm`: `--hold` is written from the clock each frame and drawn as a stroke offset (the ring) and a scale (`.hold-bar`), both transform or opacity; the drain on release is `fast`. The same progress under reduced motion, because the ring is the information (`DNG-1`) | Functional |
| A spinner that becomes a drawn check | it worked | `Button done`: the ring is replaced by a `DrawIcon` tick over `slow`; `useDoneBeat` holds the page for one `slow` so the check is seen before the page leaves (`FRM-6`, `COG-13`) | Functional |
| A copy icon that becomes a check | it is on your clipboard now, and it will be a copy button again | `CopyButton`: the faces are stacked in one cell and cross-fade on opacity and scale, in `instant` going to a result and `normal` coming back, after `BRAND.feedback.copiedHoldMs` (2 000 ms); a second copy inside the hold replays `.pop` once (`CPY-1`, `CPY-2`). Under reduced motion the fade collapses to an instant swap and the state still shows and still returns; the repeat shows no new frame but is announced again | Functional |
| A focus ring that eases in | where the keyboard is | `.field-input` `focus:ring-2` over `fast` (`FRM-4`) | Functional |
| A card that rises under a pointer | this one answers | `.lift`: `distance.lift` (4 px) with the shadow; press puts it back over `instant` rather than scaling a card (`CRD-6`) | Functional |
| Peers that arrive one after another | these belong together, in this order | `fineStaggerDelayMs` (40 ms a step, four steps) on the product grid, each row cascading from its start edge; `.stagger-fine` for plain CSS | Functional |
| A lane that fills for its own file | how far this file is, honestly | `ProgressBar` per upload lane, a translate fill from the measured percent; where the browser reports no total the lane shows an empty bar, a spinner and the word "Uploading", and no percent, because a percent it does not have would be invented (`UPL-2`) | Functional |

Nothing here bounces, nothing animates layout, and under reduced motion every
state still shows: the ring still fills (it is information, tied to the clock),
the check is still shown (without being drawn), the lift is not made, and a grid
arrives at once.

## Continuity over replacement

Prefer:

```
state A  →  perceptible transition  →  state B
```

over destroying one element and constructing an unrelated one in its place.
When the same object changes position, size, content or level, it should
*remain the same object* — `layout` and `layoutId` exist for exactly this.

The clearest cases here: a row expanding into a detail panel, a nav indicator
moving between items, a card promoting into a dialog, a disclosure expanding
from its own origin rather than fading in at full height.

## Orchestration

Do not animate every element independently. A parent transition orchestrates
its children — one interaction reads as one event, not fifteen. `framer-motion`
variants are the mechanism; the principle holds regardless of library.

The failure this prevents: a list where every row animates on its own schedule,
which reads as noise rather than as a list arriving.

## Micro-interactions

Physically coherent, and small:

| Element | Behaviour |
|---|---|
| Button | subtle hover response → controlled press compression → release → result feedback where the result matters |
| Card | rest → slight lift (`.lift` already means *this rose*) → return |
| Nav and tabs | a persistent indicator that **moves** between items rather than appearing and disappearing (built for `Tabs`; the sidebar uses a rule) |
| Disclosure | opens with one `rise` (fade and 8px) on its content and a turning chevron; **height is not animated** (a layout property, `MOT-5`) |
| Table row | selection is immediate; only the detail it opens animates |

Never random scale, bounce, rotation or elastic on an ordinary business
control. Bounce on a save button says the software is excited, which is the
wrong register for a tool someone runs a business on.

## Scroll

Scroll animation must never interfere with reading, and never delay
interaction.

**Acceptable** — progressive reveal of long content; a section assembling as
it enters; scroll-linked transformation where the scroll relationship *is* the
meaning.

**Rejected** — scroll hijacking; every section flying upward; pinned sequences;
content that arrives late; anything that makes a user wait to act.

## Responsive motion

Mobile is not desktop scaled down:

- Shorter distances
- Fewer things moving at once
- No decorative motion at all
- Functional transitions and interaction feedback **kept** — they are what
  makes touch feel responsive
- Never a transform that creates horizontal overflow

## Reduced motion — required

Every motion implementation supports `prefers-reduced-motion`. When reduced
motion is requested:

```
complex movement  →  minimal transition or an instant, legible change
```

**not**

```
complex movement  →  a broken component
```

The interface must remain fully understandable with no animation at all.
Chapter 07 makes this a gate.

How it is met, in three layers:

1. **The stylesheet** collapses every `animation` and `transition`, including on
   `::before` and `::after` (the button fill is a pseudo-element), to
   0.01 ms, and zeroes `animation-delay` and `transition-delay`. A surviving
   delay would hold a `both`-fill element at opacity 0, so the state would not
   jump, it would be missing.
2. **JavaScript-driven motion asks for itself** (`usePrefersReducedMotion`,
   `prefersReducedMotion`): Recharts series, tooltips and markers, `CountUp` (both
   modes), `ScrambleText`, `TypeText`, `SwapText`, `DrawIcon`, `TruncateReveal`,
   `useFreshOnChange`, `RevealScope`, a toast's exit wait, a dialog's exit wait, and
   the storefront's smooth-scroll library, which is not started at all.
3. **The information is carried twice.** A count-up has an `sr-only` copy of the
   settled value; a ring and a bar are a `progressbar` with their value; a loading
   button says "Working…"; an invalid field has `aria-invalid` and a message,
   not only a shake; a truncated label has its full text in `title`; a bar's tone
   is also in its `valueText`.

## Performance

Motion must never cost the user responsiveness.

- Animate `transform` and `opacity`. They are cheap.
- Avoid animating layout properties in a loop — that is layout thrashing.
- Avoid high-frequency React re-render driven by animation state.
- Do not reach for canvas or WebGL for interface motion.
- A large animated tree is a performance problem waiting for a slower device;
  the POS runs on till hardware, not a developer laptop.

## Rejection list

Reject the implementation if it has:

decorative animation with no stated purpose · durations invented in a component
instead of taken from tokens · uncoordinated transitions within one interaction
· motion that delays the task · missing focus states · missing reduced-motion
behaviour · bounce or elastic on business controls · long cinematic transitions
· scroll hijacking · movement that causes overflow on mobile · animation that
degrades frame rate on target hardware.

## Benchmark, not template

Use high-quality motion libraries and reference interfaces — Motion/framer-motion
among them — as a **quality bar for responsiveness and state continuity**.
Study the underlying interaction principle, then implement it with NEWAX
tokens, hierarchy and visual language.

Never copy another product's branding, layout, colour, typography or
decorative treatment. Visual imitation of another company's product is a
rejection condition, not a shortcut.
