# 05 · Motion

Motion exists to make the system easier to understand. Nothing else justifies
it.

> **Status: essentially unbuilt.** `framer-motion` 13.1.1 is a dependency and
> is imported by **one** file. Motion today is 83 Tailwind `transition-*`
> utilities, 4 CSS `transition` declarations and 1 `@keyframes`, with no shared
> vocabulary — and the stylesheets contain **two**
> `prefers-reduced-motion` blocks. This chapter is the specification to build
> against.

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

Values are tokens, specified in [Chapter 01](01-foundations.md). A duration
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
| Nav | a persistent indicator that **moves** between items rather than appearing and disappearing |
| Disclosure | expands from its own origin; height and contents transition together |
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

The interface must remain fully understandable with no animation at all. Two
blocks in the entire stylesheet today is not compliance. Chapter 07 makes this
a gate.

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
