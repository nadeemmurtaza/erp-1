# 10 · The law catalogue

Every borrowed law this system rests on, with a stable ID, the source it comes
from, and — the part that matters — **the ruling it has here**. A law nobody
can cite in a review is decoration. These can be cited: `PER-3`, `FLO-7`.

> **How to use this chapter.** You do not read it. You search it.
>
> ```bash
> pnpm idx design "focus"      # every chapter
> grep -n "^### ACT-" docs/design/principles-laws/10-laws.md   # one family
> ```
>
> **Status: binding as rulings, unenforced as code.** Each *ruling* below is
> binding on review. Almost none is checked by a command today — chapter 09
> is honest about which are, and chapter 15 specifies the checkers that would
> close the gap.

## Why a catalogue, and why rulings

A law from psychology is a description of people, not an instruction to a
team. "Hick's law says more choices take longer" settles no argument. What
settles an argument is a ruling: *a screen in this product may not offer more
than N primary actions; the rest go one level down.* The law is the reason,
the ruling is the rule, and only the ruling is enforceable.

So every entry below has three parts:

| Part | What it is |
|---|---|
| **Says** | the law itself, as its source states it |
| **Here** | the ruling in this codebase — binding |
| **Fails when** | the concrete defect it is meant to prevent |

Where a law is famous but *wrong for this product*, it is listed anyway, with
the ruling being the rejection and the reason. An unlisted law gets quoted at
you; a listed-and-rejected one does not.

The families, and their prefixes:

| Prefix | Family | Governs |
|---|---|---|
| `PER` | Perception | what the eye groups before the mind reads |
| `COG` | Cognition | what a person can hold, decide and recall |
| `ACT` | Action & time | pointing, waiting, responding |
| `HEU` | Heuristics | Nielsen's ten, ruled for this product |
| `TYP` | Typography | words as a system |
| `COL` | Colour | meaning carried by hue |
| `SPA` | Space & ratio | the grid, density, and the shape of a page |
| `MOT` | Motion | change over time |
| `ACC` | Accessibility | who can use it |
| `GLO` | Globalization | where it works |

Workflow (`FLO`), permissions (`PRM`), modularity (`MOD`), navigation (`NAV`)
and integrity (`ITG`) are large enough to have their own chapters — 11 to 15.

---

## PER · Perception

The eye groups before the mind reads. Every one of these is load-bearing in a
dense interface, because grouping is what makes density survivable.

### PER-1 · Proximity
**Says** — things close together are perceived as related; distance breaks the
relationship. (Wertheimer, 1923.)
**Here** — **space is the primary grouping device, ahead of borders, boxes and
lines.** Related controls sit at one space step; unrelated ones at two or
more. Never add a border to group what space can group.
**Fails when** — a form has even spacing throughout, so eight fields read as
one undifferentiated list rather than three labelled groups.

### PER-2 · Common region
**Says** — elements inside a shared boundary are perceived as a group, and
this *overrides* proximity.
**Here** — a card, panel or bordered region is a **claim that its contents
belong together**. Never use one for visual rhythm. Because it overrides
proximity, a wrongly drawn boundary is worse than no boundary.
**Fails when** — a "card" wraps two unrelated metrics because the layout
needed something to fill a column.

### PER-3 · Similarity
**Says** — elements sharing shape, colour, size or weight are perceived as the
same kind of thing.
**Here** — **one visual treatment means one kind of thing, product-wide.** If
a mark is a status, nothing that is not a status may wear its tones. **A status
is one component, `Badge` (reached through `StatusBadge`), in the house corner**;
the round `.pill` is a count chip (the number beside a wizard step today),
neither a status nor a control, and a status written as a `.pill` is a defect. This is the
perceptual half of `COL-1`, and it is why a second status component is a
defect and not a duplicate. **A button is never round**: a circular or pill
button is a second button shape, so every button, link-as-button and icon
button wears the house corner (`.btn`, `.icon-btn`, or `rounded`, which
resolves to `--radius`). Circles are for avatars, dots, spinners and count
badges; the one control that keeps a pill is the `Switch` track (an input
holding a state, the single baseline entry of `round-button`).
`check-tells` fails `round-button`.
**Fails when** — a filter chip and a status badge look identical, so users
click a status trying to filter by it.

### PER-4 · Continuity
**Says** — the eye follows the simplest continuous path and expects alignment
to mean sequence.
**Here** — **alignment is a promise of relatedness.** A shared left edge says
"these are one list". Breaking alignment for decoration breaks a promise the
reader has already believed.
**Fails when** — a nested list indents by an arbitrary amount, so depth is
unreadable and a child looks like a sibling.

### PER-5 · Closure
**Says** — the mind completes an incomplete shape rather than seeing the gap.
**Here** — **you may imply a boundary instead of drawing one.** Aligned edges
and consistent spacing are enough; this is the licence behind the house rule
that a `Section` has no box around it.
**Fails when** — every region gets a border "for clarity", and the page turns
into a grid of boxes inside boxes — the specific clutter Law 6 forbids.

### PER-6 · Figure / ground
**Says** — the eye separates a subject from its background, and can hold only
one as figure at a time.
**Here** — **one figure per screen region.** An overlay makes everything
behind it ground — so an overlay that does not command attention should not be
an overlay. Elevation and dimming are the tools; a stack of three competing
surfaces has no figure at all.
**Fails when** — a modal opens over a toast over a sticky bar, and the user
cannot tell which one is asking them something.

### PER-7 · Uniform connectedness
**Says** — elements visually connected (a line, a shared background, an
enclosing shape) are the most strongly grouped of all — stronger than
proximity or similarity.
**Here** — **connection is the heaviest grouping tool, so it is the rarest.**
A table row's shared background, a timeline's connecting line. Never connect
what is not actually a sequence or a unit.
**Fails when** — a stepper draws a connecting line through steps that can be
done in any order, promising a sequence that does not exist.

### PER-8 · Prägnanz (simplicity)
**Says** — the eye resolves ambiguous arrangements into the simplest available
interpretation.
**Here** — **if a layout can be misread simply, it will be.** When a design
has two readings, ship the one the simplest reading produces, or change the
design until there is one reading.
**Fails when** — a two-column layout is meant to be read left-to-right in
pairs but is read top-to-bottom in columns, and every value lands on the wrong
label.

### PER-9 · Focal point
**Says** — the eye is drawn first to whatever differs most from its
surroundings.
**Here** — **each screen has exactly one intended first stop**, and it is the
one job of the page (Law 5). Everything competing with it is a bug, including
a second primary button — which is why `PageHeader` takes one.
**Fails when** — three accent-coloured buttons sit in one header and the eye
has nowhere to land, so the user reads the whole page to find the action.

---

## COG · Cognition

### COG-1 · Hick's law
**Says** — decision time grows logarithmically with the number and complexity
of choices. (Hick 1952, Hyman 1953.)
**Here** — **a screen offers one primary action, and groups the rest.** Nine
unstructured options is a worse screen than three groups of three. This is
Law 7 ("overview first") stated as a decision cost, and in a product with
hundreds of capabilities it is the single most important law in this chapter.
**Fails when** — an actions menu lists 24 flat items and users learn exactly
two of them.

### COG-2 · Miller's law
**Says** — working memory holds about seven items, plus or minus two — and the
modern reading is lower, nearer four, for unfamiliar material.
**Here** — **never require a person to carry more than ~4 unfamiliar items
between screens.** If step 7 needs a value from step 2, step 7 shows it. This
is the law that makes long workflows survivable, and `FLO-6` is its
enforcement.
**Fails when** — a transfer wizard asks for a quantity on step 9 without
restating the available stock from step 3, and the user guesses.

> Miller's "7±2" is the most over-cited number in design. It described
> immediate recall of *unrelated items* in a lab, not how many nav entries a
> menu may have. Chunking (`COG-3`) is the usable half.

### COG-3 · Chunking
**Says** — information grouped into meaningful units is recalled far better
than the same information ungrouped.
**Here** — **every list longer than about seven items is grouped, and every
group is labelled.** An order number prints as `YSN-2026-0142`, not
`YSN20260142`. A permission list is grouped by resource, never alphabetical
across two thousand rows.
**Fails when** — an IBAN, phone number or long reference renders unspaced and
nobody can read it back over a phone.

### COG-4 · Cognitive load — intrinsic, extraneous, germane
**Says** — total mental effort splits into the task's own difficulty
(intrinsic), the effort the interface adds (extraneous), and the effort that
builds understanding (germane). (Sweller, 1988.)
**Here** — **extraneous load is the only kind you are allowed to add, and the
target is zero.** A 100-step procurement workflow has high intrinsic load
that no design removes; the design's whole job is to add nothing on top. This
is the sharpest statement of Law 6 in the catalogue.
**Fails when** — a genuinely complex approval screen also makes the user work
out which of four similar buttons submits it.

### COG-5 · Progressive disclosure
**Says** — show what is needed now; make the rest reachable, not absent.
**Here** — **this is Law 2, and it is the difference between the two.** Power
is moved, never removed. Every disclosure has an obvious handle, and its
closed state says what is inside — "3 advanced options", not "More".
**Fails when** — a `Disclosure` labelled "Advanced" hides the one field a
whole department needs daily, and they never find it.

### COG-6 · Recognition over recall
**Says** — recognising is far cheaper than remembering. (Nielsen heuristic 6.)
**Here** — **never require a code, ID or exact name to be typed from memory.**
Pickers, search-as-you-type and recent items. With 250+ roles and thousands of
permissions, any screen asking a person to remember a permission key is
broken by construction.
**Fails when** — assigning a permission requires typing `inventory.transfer.approve`
exactly, and a typo silently grants nothing.

### COG-7 · Jakob's law
**Says** — people spend most of their time on other products, so they expect
yours to work like those.
**Here** — **convention wins over invention unless invention is measurably
better.** A table sorts by clicking its header. A form submits on Enter. Save
is not on the left. Novelty in a system where an error costs millions is a
cost, not a feature.
**Fails when** — a custom date picker rejects the format a user types because
it wanted them to click.

### COG-8 · Tesler's law (conservation of complexity)
**Says** — every process has irreducible complexity; the only question is who
absorbs it, the system or the user.
**Here** — **the system absorbs it.** This is the owner's own standing
instruction in psychological form: *"the system does the work; the client
should not have to manage unnecessary technical complexity."* Tax rules,
multi-branch stock, currency, permission resolution — computed, never asked.
**Fails when** — a form asks the user to calculate a line total that the
server already knows.

### COG-9 · Zeigarnik effect
**Says** — interrupted or incomplete tasks are remembered better than
completed ones, and their incompleteness creates pressure to finish.
**Here** — **an unfinished workflow must be visible and resumable**, or the
pressure turns into anxiety and then abandonment. Every long flow shows
progress, and every draft is findable from somewhere other than the browser's
history. See `FLO-3`.
**Fails when** — a half-finished stock count exists only in a URL the user
closed.

### COG-10 · Goal-gradient effect
**Says** — effort increases as a visible goal gets closer; perceived progress
motivates more than actual progress.
**Here** — **long flows show progress as steps completed, not a percentage
invented from nothing.** Never show artificial progress. In a 100-step
workflow, group steps into named stages so the person can see a stage end
rather than a distant total.
**Fails when** — a progress bar sits at 60% for forty steps and the user
concludes it is stuck.

### COG-11 · Serial position effect
**Says** — the first and last items in a series are recalled best; the middle
is lost.
**Here** — **the most important item in any list goes first or last, never
the middle.** This governs nav order, action menus and column order — and it
is why destructive actions go last, separated, where they are also hardest to
hit by accident (`ACT-2`).
**Fails when** — the most-used report is eleventh of nineteen in a flat menu.

### COG-12 · Von Restorff (isolation) effect
**Says** — the item that differs from its neighbours is the one remembered.
**Here** — **difference is a budget, and it is nearly spent by the accent
colour.** One emphasised thing per region. If everything is emphasised,
nothing is — which is Law 6 restated perceptually.
**Fails when** — every metric on a dashboard is bold and coloured, and a real
exception cannot be spotted.

### COG-13 · Peak-end rule
**Says** — an experience is judged by its most intense moment and its ending,
not its average.
**Here** — **the end of a workflow is designed with the same care as its
start.** A 100-step process that ends on a bare "Saved." toast is remembered
as bad. Confirmations state what happened, what it means, and what is next.
**Fails when** — submitting a purchase order returns the user to an empty list
with no indication the order exists.

### COG-14 · Selective attention / banner blindness
**Says** — people filter out anything that looks like what they came to
ignore.
**Here** — **never put critical information in a shape people have learned to
skip** — a top banner, a coloured strip, an ad-like box. A blocking condition
belongs where the action is, not in a bar at the top of the page.
**Fails when** — "this branch is offline, stock figures are stale" is a top
banner, and nobody reads it before committing a sale.

---

## ACT · Action and time

### ACT-1 · Fitts's law
**Says** — time to acquire a target is a function of its distance and size;
big and near is fast, small and far is slow.
**Here** — **target size is a floor, not a preference: 44×44 CSS px, and
48×48 on the POS**, where the user is standing, fast, and often not looking.
The primary action sits where the hand already is — bottom-right on touch,
near the last field in a form.
**Fails when** — a till's "complete sale" button is a 32px icon in a corner.

### ACT-2 · The consequence–proximity rule
**Says** — a consequential option placed next to a benign one will be hit by
accident. (Nielsen Norman Group.)
**Here** — **destructive actions are never adjacent to their common
neighbour.** Separate them by space, position (last, per `COG-11`), or a
level of disclosure. Combined with `ACT-1`: a destructive target is *not*
made large and near.
**Fails when** — "Void sale" sits beside "Print receipt" in a POS toolbar.

### ACT-3 · The Doherty threshold
**Says** — below about 400 ms of response time, a user stays in "doing" mode;
above it they switch to "waiting" and productivity collapses. (Doherty &
Thadani, IBM, 1982.)
**Here** — **acknowledge every interaction within one frame, whatever the
result costs.** The acknowledgement and the result are two different
promises. In a till, 400 ms per scan across a 40-item basket is nearly half a
minute of a customer's patience.
**Fails when** — a barcode scan shows nothing until the server replies, so the
operator scans it twice.

### ACT-4 · Response-time limits — 0.1 s / 1 s / 10 s
**Says** — 0.1 s feels instantaneous; 1 s keeps the thought unbroken; beyond
10 s attention is gone. (Nielsen, from Miller 1968 and Card 1991.)
**Here** — the three tiers are a **design contract**, and chapter 04's loading
tiers implement them:
| Under | Show | Never |
|---|---|---|
| 0.1 s | the result | a spinner — it flashes and reads as a fault |
| 1 s | an immediate optimistic or pending state | nothing |
| 10 s | determinate progress, and what is being done | an indeterminate spinner alone |
| over 10 s | make it a background job with a notification | hold the user hostage |
**Fails when** — a 40-second report export renders a spinner, and the user
reloads the page at second 25 and starts it again.

### ACT-5 · Postel's law (robustness)
**Says** — be conservative in what you send, liberal in what you accept.
**Here** — **accept every reasonable input shape and normalise it.** A phone
number with spaces, dashes or a country code. A pasted SKU with whitespace. A
date in the locale's format. Rejecting input a human clearly meant is the
system refusing to absorb complexity, which `COG-8` forbids.
**Fails when** — pasting `+92 335 621 2709` fails validation because the field
wanted digits only.

### ACT-6 · The undo-over-confirm rule
**Says** — a blanket "Are you sure?" trains people to dismiss dialogues
unread, so the one that mattered is dismissed too. Match friction to blast
radius. (NN/G; Smashing.)
**Here** — **three tiers, decided by reversibility and blast radius:**
| Blast radius | Guard |
|---|---|
| Reversible, small | do it; offer undo |
| Irreversible, or wide | a hold (`DNG-1`, `HoldToConfirm`) when the label says all there is to say; otherwise a dialogue that *names the object and the count* |
| Irreversible and financial or cross-branch | name the object **and** require typing it |
A confirmation that does not state exactly what is about to happen is not a
guard, it is a speed bump.
**Fails when** — "Delete 1,240 stock records?" reads "Are you sure?" and
somebody clicks OK.

### ACT-7 · Pareto (the 80/20 rule)
**Says** — most effects come from a few causes; most use comes from a few
features.
**Here** — **the common path is one click; the rare path is allowed to be
five.** This is the principle that makes Law 2 safe: moving something down a
level is only correct if it is genuinely rare, and "rare" is measured per
role, not guessed globally.
**Fails when** — a screen optimises the quarterly task and buries the hourly
one.

### ACT-8 · Occam's razor
**Says** — among designs that satisfy the requirement, prefer the one with
fewest parts.
**Here** — **a new component, prop, state or screen must earn itself.** The
repo already asks *"what real boundary justifies its existence?"* — this is
that question applied to pixels. See chapter 08's rule of three.
**Fails when** — a fourth button variant exists because one screen wanted a
slightly different grey.

---

## HEU · Nielsen's ten, ruled

Jakob Nielsen's heuristics (1994) are the most-cited list in the field. Listed
here **with the ruling**, because the heuristic alone decides nothing.

### HEU-1 · Visibility of system status
**Here** — the system says what it is doing, what it just did, and — in a
multi-branch, partly-offline product — **which node and which branch the data
came from, and how stale it is.** A figure with no provenance is a guess.

### HEU-2 · Match the real world
**Here** — the product speaks the business's language, not the schema's.
"Goods receipt", not `GRN_CREATE`. An enum value never reaches a screen
untranslated. Chapter 06's terminology table is the register.

### HEU-3 · User control and freedom
**Here** — **every screen has a marked exit that is not the browser's back
button**, and no flow may trap a user. This is the "no dead ends" rule in
`.claude/rules/ui.md`, and chapter 15 makes it checkable.

### HEU-4 · Consistency and standards
**Here** — one word per concept, one component per job, one pattern per
problem — across admin, storefront, POS and mobile. Cross-surface
inconsistency is the expensive kind: the same person uses two of them.

### HEU-5 · Error prevention
**Here** — **prevention outranks messaging, and constraint outranks
validation.** A date picker instead of a parsed string; a branch selector
instead of a typed code; a server-computed total instead of a typed one. With
an error costing millions, a screen that *can* express an invalid state is a
worse design than one that cannot.

### HEU-6 · Recognition over recall
**Here** — see `COG-6`. The ruling is the same and it is binding twice.

### HEU-7 · Flexibility and efficiency
**Here** — **accelerators for the trained, without cost to the untrained.**
Keyboard paths, saved views, bulk actions, defaults that learn. A till
operator runs the same flow 300 times a day; a department head runs it twice
a year. Both are first-class, and the accelerator is never the only path.

### HEU-8 · Aesthetic and minimalist design
**Here** — Law 6. Ships when nothing visible could be removed. Note the real
meaning: *minimal*, not *sparse*. A dense table can satisfy this; a page of
decorative cards cannot.

### HEU-9 · Recognise, diagnose, recover
**Here** — every error says **what happened, why, and what to do next**, in
that order, in the user's language, with the identifiers needed to act.
Chapter 06 holds the standard. An error that names a stack frame is a defect.

### HEU-10 · Help and documentation
**Here** — **help is in the screen, not in a manual.** Field-level hints,
worked examples in empty states, and a policy link where a policy governs.
With hundreds of departments, a central help site nobody opens is not help.

---

## TYP · Typography

### TYP-1 · Measure (line length)
**Says** — 45–75 characters per line is the readable range; 66 is the classic
target. Beyond ~80 the eye loses the start of the next line. (Bringhurst;
Baymard.)
**Here** — **prose is capped at ~70 characters**, using `ch` or a max-width,
regardless of how wide the screen is. This is the single most common way a
`2xl` layout gets worse rather than better. Table cells and labels are exempt
— they are not prose.
**Fails when** — a description field stretches to 1400 px on a wide monitor.

### TYP-2 · Leading follows measure
**Says** — the longer the line, the taller the line height must be.
**Here** — the type scale ships size **and** line height together, as
`packages/shared/src/theme-type.ts` already does. Never set a size without
its line height; never override one alone.

### TYP-3 · A scale, not sizes
**Says** — a modular scale (a fixed ratio between steps) produces relationships
the eye reads as intentional.
**Here** — **nine steps exist and nothing else may be used.** `micro` 11 ·
`tiny` 12 · `small` 14 · `body` 16 · `large` 18 · `heading` 20 · `title` 24 ·
`display` 30 · `metric` 40. A tenth size is a defect, not a nuance.

### TYP-4 · Hierarchy is contrast, not size alone
**Says** — hierarchy comes from size, weight, colour and space together; size
alone is the weakest tool and the most expensive in vertical space.
**Here** — prefer weight and colour over size for in-page hierarchy. `micro`
uppercase in the quietest grey outranks a larger heading for a label, and
costs 11 px instead of 20.

### TYP-5 · Tabular numerals for tabular data
**Says** — proportional digits do not align in columns; tabular (monospaced)
digits do.
**Here** — **every column of numbers uses tabular figures and right
alignment.** Money, quantities, counts. A misaligned money column is misread,
and misread money is the failure mode this whole system is built against.
**Fails when** — a stock report's quantity column wanders and a 1,000 reads as
100.

### TYP-6 · Case carries meaning
**Says** — all-caps is slower to read and is a signal, not an emphasis.
**Here** — uppercase is reserved for the `micro` eyebrow. Never a sentence,
never a button, never a heading. Sentence case everywhere else — and
**never** Title Case, which does not survive translation.

### TYP-7 · Alignment: one edge
**Says** — the eye needs a hard vertical edge to return to.
**Here** — **left-aligned (start-aligned) by default, everywhere.** Centred
text only for a single short line in an empty state. Justified text never —
it creates rivers, and it is actively harmful in Urdu.

### TYP-8 · Type must survive the font not loading
**Says** — a webfont is a network dependency.
**Here** — every stack ends in a system fallback, and the fallback is metric-
compatible enough that layout does not shift. `brand.ts` already ships three
stacks; the Nastaliq stack exists because Urdu descenders collide without it
(`GLO-5`).

---

## COL · Colour

### COL-1 · Colour is semantic, never decorative
**Says** — in a functional interface, a hue that does not mean something is
noise.
**Here** — **every colour in this product has exactly one job**, and the job
is fixed in `brand.ts`: accent = action; positive/negative = direction;
`star` = ratings and nothing else; neutral = everything structural. Red is
reserved hard — a failure or a destruction, never an emphasis.
**Fails when** — a "high value order" is coloured red for emphasis and reads
as an error.

### COL-2 · Never colour alone
**Says** — about 1 in 12 men cannot distinguish red from green; colour alone
also fails in print, in glare, and in a screenshot pasted into a report.
**Here** — **every state carries a second channel**: an icon, a label, a
shape, or position. A status pill has text. A chart series has a direct label
or a pattern. This is WCAG 1.4.1 and it is not optional.
**Fails when** — a stock report shows shortages in red only, and the
warehouse manager who printed it in greyscale ships the wrong quantity.

### COL-3 · Contrast floors
**Says** — WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text (≥24 px, or
≥19 px bold), 3:1 for interactive component boundaries and meaningful
graphics.
**Here** — **binding floors, measured, not judged by eye.** Chapter 07
records the one known failure: `neutral-100` (#E8E8E8) as a border does not
reach 3:1 on white, so it may carry no meaning a user must perceive.
**Fails when** — a disabled-looking control is actually enabled and nobody can
tell.

### COL-4 · Accent scarcity (the 60–30–10 heuristic)
**Says** — roughly 60% dominant surface, 30% secondary, 10% accent. The value
is not the ratio, it is the scarcity: an accent only reads as "act here" when
it is rare.
**Here** — **the accent appears on the primary action and the current
selection. That is the list.** One accent-coloured element per region.
Combined with `PER-9`, this is what gives a dense screen a first stop.
**Fails when** — a nav with twelve accent-coloured icons has no focal point.

### COL-5 · Dark mode inverts lightness, not the palette
**Says** — to raise contrast you darken on light and lighten on dark; the same
hex cannot serve both.
**Here** — every semantic colour resolves per theme through a token. **Never
invert with a filter**, which destroys images and reverses the meaning of the
feedback colours.

### COL-6 · Neutral does the work
**Says** — a long, even neutral ramp carries structure so hue does not have
to.
**Here** — the ten-step neutral ramp in `brand.ts` is the product's actual
palette; accent and feedback are accents on top of it. A screen that reads
well in pure greyscale is correctly built.

---

## SPA · Space, ratio and the shape of a page

### SPA-1 · The 8-point grid, with a 4-point half step
**Says** — restricting spacing to multiples of 8 (with 4 where 8 is too
coarse) removes a class of decisions and renders crisply at 1×, 1.5×, 2× and
3×. Used by Carbon, Fluent, Polaris and Ant.
**Here** — **spacing is a token or it is a defect.** The scale, once built
(chapter 01 specifies it, nothing implements it yet): 4 · 8 · 12 · 16 · 24 ·
32 · 48 · 64. A raw `13px` has no meaning the next person can read.

### SPA-2 · Space encodes relation
**Says** — the gap between two things states how related they are; this is
`PER-1` as a measurement.
**Here** — **the gap inside a group is always smaller than the gap around
it.** When that inverts, the grouping reads backwards, and the reader groups
a label with the wrong value. One of the few layout bugs that produces a
*wrong answer* rather than an ugly page.

### SPA-3 · Density is a mode, not a value
**Says** — the right density depends on the task, not on taste: a scanning
task wants compact, a data-entry task wants comfortable.
**Here** — comfortable (48–56 px rows) is the default; compact (40–44 px) is
the setting for admin tables and the POS till, where a role scans hundreds of
rows (the "tight" rows of `02-layout`'s density table are this). **Density changes spacing
only** — never type size, never target size, which are floored by `ACT-1` and
`ACC-4`.

### SPA-4 · Centre of gravity — *no ring of content around a void*
**Says** — an interface whose content clings to the edges while the middle is
empty reads as broken, because `PER-6` finds no figure.
**Here** — **explicitly binding, and the owner's own words: no corner or side
positioning while the centre is empty.** At every one of the seven widths, the
optical centre of a page carries its main job. Where content genuinely does
not fill the width, the *container* is constrained and centred — the content
is not pushed outward to reach the edges. This is the operational reading of
Law 4's "no dead space".
**Fails when** — a `2xl` screen shows a sidebar at the far left, a toolbar at
the far right, and 900 px of nothing between them.

### SPA-5 · Whitespace is structure, not leftovers
**Says** — space is the cheapest grouping, hierarchy and emphasis tool
available, and the only one that adds nothing to the page.
**Here** — **removing space is not how a page fits.** If a layout does not
fit, reduce what is on it (Law 2 — move a level down), never the space
between what remains. Space is the last thing cut, not the first.

### SPA-5a · Density and emptiness are different failures
**Says** — "no dead space" and "no clutter" pull in opposite directions and
are resolved by *what* fills the space, not *how much*.
**Here** — dead space is space carrying no structural job. Space that
separates two groups is doing a job (`SPA-2`) and is not dead. The test is
not "is this area empty" but **"would the page read the same if this area
were removed entirely?"** If yes, the layout is wrong. If no, the space is
working. Filling a gap with a widget nobody asked for violates Law 6 to
satisfy Law 4, which is not a trade this system permits.

### SPA-6 · Optical alignment beats mathematical alignment
**Says** — the eye aligns shapes, not bounding boxes; a circle set to the same
box as a square looks smaller and higher.
**Here** — icons are optically sized against their text, not box-matched.
Where the two disagree, the eye wins.

### SPA-7 · Ratio: one scale for space, one for type, one for size
**Says** — mixing arbitrary ratios produces relationships the eye reads as
accidental.
**Here** — three scales, no fourth: **space** on the 8-point grid, **type** on
the nine-step scale (`TYP-3`), **radius** on `sharp` 2 / `lg` 3 / `pill`.
Radius does not scale with size — a big panel does not get a big radius.

### SPA-8 · Intrinsic layout before breakpoints
**Says** — layouts that respond to their content (`grid`, `flex-wrap`,
`minmax`, `clamp`) need fewer breakpoints and break less. Container queries
let a component respond to *its own* space rather than the viewport.
**Here** — **a component that appears in more than one container uses a
container query, not a media query.** The seven widths (Law 4) govern the
page skeleton; components govern themselves. This is what stops a card
designed for a wide main column from breaking inside a narrow drawer.

### SPA-9 · Fluid type has a ceiling
**Says** — a `clamp()` whose maximum exceeds ~2.5× its minimum fails WCAG
1.4.4 under 200% zoom.
**Here** — fluid type is bounded by the nine-step scale at both ends. The
scale is the contract; `clamp()` interpolates inside it and never outside.

---

## MOT · Motion

Chapter 05 is the full language. These are the laws under it.

### MOT-1 · Motion communicates or it does not ship
**Says** — in a productivity tool, animation that carries no information is a
delay with a decoration on it.
**Here** — every motion answers **what changed, where it went, or what is
happening**. If it answers none, delete it. This is Law 6 in the time
dimension.

### MOT-2 · Duration scales with distance and size
**Says** — a small, near change reads as slow if given a large duration; a
large change reads as a jump if given a small one. (Material.)
**Here** — the token names say the job: `instant` 80 ms (a press going down),
`fast` 140 ms (hover, focus, an exit), `normal` 220 ms (a panel, an arrival),
`slow` 320 ms (full-surface or route-level), `sweep` 420 ms (the button fill and
a page-level figure resolving). A 500 ms hover is a bug. (These are the names in
`brand.ts`; this law used to name `quick` and `base`, which never existed.)

### MOT-3 · Easing carries meaning
**Says** — decelerate for things entering (they arrive and settle), accelerate
for things leaving (they go and do not return), standard for things moving in
place.
**Here** — the three easings are the vocabulary; a linear curve is used only
for a continuous indeterminate loop, never for a transition.

### MOT-4 · Reduced motion is a requirement, and it preserves information
**Says** — `prefers-reduced-motion` is an accessibility setting, not a style
preference; vestibular disorders make large motion genuinely harmful.
**Here** — **under reduced motion the information the motion carried must
survive.** Cross-fade or appear in place; never simply jump, or the
orientation the motion provided is lost rather than reduced. The stylesheet
rule reaches pseudo-elements and delays, and JavaScript-driven motion asks for
itself (`usePrefersReducedMotion`); chapter 05 lists the three layers.

### MOT-5 · Never animate a property that forces layout
**Says** — `width`, `height`, `top`, `left` and `margin` trigger layout on
every frame; `transform` and `opacity` do not.
**Here** — transform and opacity. On a till running on modest hardware with a
40-item basket on screen, this is the difference between usable and not.
Two bounded exceptions, both in the expressive tier and both touching no
ancestor or sibling layout: `CountUp` writes the text of one figure (tabular
figures, a block of its own, for 420 ms), and `ProgressRing` transitions
`stroke-dashoffset` (paint only, on a 36px SVG). No primitive animates `width`,
`height`, `top`, `left` or `margin`. `check-tells` fails `layout-motion` on a
`transition-[…]` or `transition:` that names one; one storefront site is held in
its baseline (the stitching panel's `max-height` accordion, which needs a
`Disclosure` rebuild), and the nav underline grows with `scale-x` instead of
`width`.

### MOT-6 · Orchestration, not simultaneity
**Says** — a group of elements animating together reads as a single event; a
staggered group reads as a list arriving.
**Here** — stagger is capped: a list animates at most its first few items,
with a small offset, and never scales the total duration with the row count.
A 200-row table does not animate.

---

## ACC · Accessibility

Chapter 07 is the full chapter; these are the laws it enforces. Target:
**WCAG 2.2 AA**, as a floor.

### ACC-1 · Keyboard reaches everything
**Says** — WCAG 2.1.1/2.1.2: every function is operable by keyboard, with no
trap.
**Here** — including the POS, where till hardware often has a keyboard and no
mouse. Tab order follows visual order; if it does not, the DOM is wrong —
never patch with `tabindex` above 0.

### ACC-2 · Focus is visible, and not obscured
**Says** — WCAG 2.4.7 (visible) and **2.4.11 Focus Not Obscured**, new in 2.2:
a focused element may not be entirely hidden by sticky headers, footers or
overlays.
**Here** — a focus ring that meets `COL-3`, and **every sticky element is
tested by tabbing through the page behind it.** Sticky toolbars are the
common cause of this failure.

### ACC-3 · Focus goes somewhere sensible
**Says** — after an overlay closes, focus returns to what opened it; after a
route change, focus moves to the new heading.
**Here** — binding. A closed dialogue that drops focus to `<body>` sends a
keyboard user back to the top of the page — in a 100-step workflow that is a
catastrophe, not an annoyance.

### ACC-4 · Target size
**Says** — WCAG 2.2 **2.5.8** requires 24×24 CSS px minimum at AA; 44×44 is
the AAA figure and the mobile-platform norm.
**Here** — **44×44 minimum below `fold` (672 px), where a thumb is likely; 48×48
on POS at every width.** Above the standard deliberately: this is a system
operated at speed by people who are standing up. From `fold` up, where a
pointer is likely, `.btn` is 40 tall and `.icon-btn` 36 square, and `.chip` and
`.btn-text` drop their floor; nothing goes below WCAG's 24×24 with spacing.
Width is a proxy for the input device, so a touch tablet at 672 px or wider
gets pointer sizes: keying those four classes to `@media (pointer: fine)`
instead of `fold:` closes it, a visible change that is an open decision
(ADR-083, consistency addendum). This is the one statement of the rule; other
chapters link here.

### ACC-5 · Accessible authentication
**Says** — WCAG 2.2 **3.3.8**: no cognitive-function test in authentication
without an alternative; paste must not be blocked.
**Here** — password managers work, paste works everywhere. With 250+ roles
and shared till hardware, blocking paste guarantees weak, written-down
credentials — the accessibility rule and the security outcome agree.

### ACC-6 · Semantics before ARIA
**Says** — the first rule of ARIA is not to use ARIA: a native element carries
role, state and keyboard behaviour for free.
**Here** — a `<button>` is a button. 120 hand-written `aria-*` attributes
exist today with **zero** lint enforcement, which chapter 09 ranks as the
cheapest large win available.

### ACC-7 · Never rely on hover or pointer alone
**Says** — hover does not exist on touch, and 1.4.13 requires hover-revealed
content to be dismissible, hoverable and persistent.
**Here** — **anything reachable only by hover is unreachable on the POS and
on mobile.** Row actions revealed on hover need a visible affordance on
touch.

### ACC-8 · Motion, contrast and text size are user settings
**Says** — `prefers-reduced-motion`, `prefers-contrast`, and browser zoom to
200% (WCAG 1.4.4) are the user's, not the designer's.
**Here** — layouts survive 200% zoom without horizontal scrolling at any of
the seven widths. Tested, not assumed.

---

## GLO · Globalization

Urdu ships today. This family is not hypothetical.

### GLO-1 · Text expands
**Says** — translated UI strings routinely grow 30% (German, Dutch) and short
labels can grow 100–300%.
**Here** — **no layout may depend on the length of a string.** No fixed-width
buttons, no single-line assumptions, no truncation without a title. Test with
pseudo-localisation, which is the highest-value i18n technique and the most
skipped.

### GLO-2 · Logical properties, never physical
**Says** — `left`/`right` are wrong in a right-to-left locale; `inline-start`
/`inline-end` are correct in both.
**Here** — binding across web, POS and mobile. A physical direction in a
stylesheet is a bug in Urdu, not a style choice. Chapter 07 records that RTL
handling today is 30 scattered references and no system.

### GLO-3 · Mirroring is not flipping
**Says** — in RTL, layout and flow mirror — but numbers, clocks, media
controls, charts with a time axis, and logos do not.
**Here** — **mirror the layout; never mirror a quantity, a timeline or a
progress direction.** An icon that means "forward" mirrors; an icon that
means "play" does not.

### GLO-4 · Locale is not language
**Says** — language, region, calendar, currency and number format vary
independently; a person may read English and need Pakistani formats.
**Here** — the brand file already separates `locales`, `intlTags`, `currency`,
`timeZone` and `dialCode`. **Never derive one from another in application
code** — that is the assumption Law 1 exists to prevent.

### GLO-5 · Scripts have different metrics
**Says** — Nastaliq Urdu has deep descenders and needs far more leading than
Latin; CJK needs different line-breaking.
**Here** — `brand.ts` ships `rtlLineHeight: 2.1` and a Nastaliq-first stack
for exactly this reason. A line height set for Latin clips Urdu.

### GLO-6 · Never concatenate a sentence
**Says** — word order differs by language, so `"Deleted " + n + " items"`
cannot be translated correctly.
**Here** — **whole sentences are single translation keys with named
placeholders**, and plural rules come from the locale (Urdu and English
differ). A string assembled in code is untranslatable by construction.

### GLO-7 · Formatting goes through the formatter
**Says** — a number, date, currency or address rendered by hand is wrong in
some locale.
**Here** — binding, and already counted before every PR: `toLocaleString` in
application code is a defect. Money is an integer of minor units end to end
(`minorUnitsPerMajor` in `brand.ts`); float money is a class of bug this
product cannot afford.

### GLO-8 · Personal and postal data have no universal shape
**Says** — not everyone has a family name; postcodes are not universal; a
province is an emirate, a county, a state.
**Here** — `brand.ts` carries `regionLabel` and `regions` for exactly this,
because they had been typed into the checkout page. **Never validate a name,
never require a postcode, never hardcode a region list.**

---

## Where the card-deck laws are built

Twelve of the laws above arrived again on the owner's rule cards of 2026-10-01
(Fitts, Hick, chunking, Doherty, proximity, Von Restorff, the goal gradient,
Postel, Tesler, similarity, serial position, peak-end). They are not restated in
chapter 03; this table says which artifact makes each one true, so a review can
open the file rather than take the claim. "Not enforced by a command" is stated
where it is the case.

| Law | Where it is built | Held by |
|---|---|---|
| `ACT-1` Fitts | `field-xl` (56 px) on every form field; `Dropzone`, whose whole area is the target; the full-width submit in `FormStack` | review; touch size is not linted (`.claude/rules/design.md`) |
| `COG-1` Hick | `Select` and `Menu` filter past ten rows (`lib/menu-filter.ts`); `Segmented` replaces a menu under five (`MNU-6`) | `lib/menu-filter.spec.ts`; `check-menus` holds short native selects at 0 (a ratchet) |
| `COG-3` Chunking | `FormStack` groups fields in sixteens; `DangerZone` closes over its acts; `DateField` splits a date into month and year jumps | review |
| `ACT-3` Doherty | `Button loading`, the `HoldToConfirm` ring and `UploadTray` rows all answer in the frame the input arrives; the result may take as long as it takes | `lib/guard.spec.ts`, `lib/upload-queue.spec.ts` |
| `PER-1` Proximity | `Field`: label 4 px from its control, 16 px from the field before; the product card: 8 px between lines, 24 between cards | review |
| `COG-12` Von Restorff | one filled button per form (`FormStack`'s `actions`); the one accent on a card is the price and its button (`Price tone="accent"`); red only on destruction (`DNG-4`) | review; `check-danger` holds the labels, not the red |
| `COG-10` Goal gradient | `UploadTray` counts real files ("2 of 5"); `Wizard` counts real steps. Progress is never invented to look closer than it is | `lib/upload-queue.spec.ts` |
| `ACT-5` Postel | `lib/date-parse.ts` reads many shapes of a date and writes one; `Dropzone` takes a drop, a paste or a pick; `normalizePhone` | `lib/date-parse.spec.ts` |
| `COG-8` Tesler | the system carries the rules so the person does not: `lib/upload-rules.ts` checks type and size at drop time and states the limits first; `lib/guard.ts` decides what a hold is | `lib/upload.spec.ts`, `lib/guard.spec.ts` |
| `PER-3` Similarity | every form is `Field` inside `FormStack`; every destructive control is the same red, from `ConfirmDialog` to `HoldToConfirm` | `check-danger` (labels); `check-tells` (`round-button`, for shape); review (the rest) |
| `COG-11` Serial position | the primary is first in `FormStack` and its links follow; `DangerZone` is last on the page; a card reads title, price, button | review |
| `COG-13` Peak-end | `useDoneBeat` and `Button done` draw the check before the page leaves; `UploadTray` ends on a plain "2 of 5 uploaded · 1 failed"; `CooldownBanner` names the day it ends | `lib/guard.spec.ts` |

---

## Where the two reels' laws are built

Two reels of 2026-10-02 ("Hierarchy", "Success is a system") arrived as seven new
laws, `HIE-1` and `HIE-2` in chapter 02 and `SUC-1` to `SUC-5` in chapter 04, each
standing on a law above. This table says which artifact makes each one true and
what holds it, so a review opens the file rather than taking the claim.

| Law | Where it is built | Held by |
|---|---|---|
| `HIE-1` One headline (on `TYP-4`) | `PageHeader` is the one title step on a page; `SuccessState` is `text-2xl` as an `h1` and `text-lg` as an `h2`, so a nested one never ties with the page's title | review (`/ux-review` item 3); a type step is not linted |
| `HIE-2` Three stops (on `PER-9`, `COL-4`) | `FormStack`'s one filled button; `SuccessState` has exactly one `btn-primary` and its DOM order is its focus order (title, proof, primary, secondary, loop, back) | a one-off browser run, not in CI: Tab order and overflow at the seven widths, both themes; otherwise review |
| `SUC-1` Specific | `SuccessState`'s `title` takes a node so a figure can settle in, and `detail` carries the proof; the adopters name the order number, the total and the date | `check-tells` `vague-success` holds a literal "Success", "Done" or "Saved" as a toast or a `SuccessState` title at 0; a title that is an expression is counted, not failed |
| `SUC-2` Next step (on `ITG-1`) | `SuccessState`'s `primary` is required by type and by a runtime guard that renders nothing without a label and a destination | nothing automated: the web app has no component test harness, so the guard is stated in the specimen and checked by a one-off browser run, not by a test |
| `SUC-3` Stakes | the three rows of `04-states.md`: inline or a toast of 4 000 ms (`useToast` default), `SuccessState`, `SuccessState` with a receipt. Five storefront screens and the admin CSV import moved to row 2 or 3 | review; which row a screen belongs in is a judgment no command makes |
| `SUC-4` Open loop (on `COG-9`) | `SuccessState`'s `loop`: an ordered list of real states, one at most, with the state read by assistive technology beside the icon | review: whether the system can follow the thread is a fact about the data, not the component |
| `SUC-5` Rare joy (on `COG-13`) | `celebrate` is off by default and no screen passes it; the burst is eight sparks on transform and opacity, and none under reduced motion | `lib/success-state.spec.ts` holds the burst's numbers; a one-off browser run counted 8 sparks once and none under reduced motion. The milestone record that would let a screen pass it does not exist: a separate work order |

---

## Where the copy laws are built

One reel of 2026-10-02 ("Copy needs proof") arrived as five laws, `CPY-1` to `CPY-5`
in chapter 03, each standing on a law above (`ACT-3`, `ACC-6`, `ACC-8`, `FLO-7`).
This table says which artifact makes each one true and what holds it, so a review
opens the file rather than taking the claim.

| Law | Where it is built | Held by |
|---|---|---|
| `CPY-1` The flip is the receipt (on `ACT-3`) | `CopyButton`'s stacked faces cross-fade on opacity and scale in `instant` (80 ms); the state moves only when `copyText` has resolved, never before | `lib/copy.spec.ts` (the state machine); a one-off browser run measured the flip 11.4 ms after the click and no `.spinner` at any point; not in CI |
| `CPY-2` Two seconds, then back | `BRAND.feedback.copiedHoldMs` (2 000 ms) read as `COPIED_HOLD_MS`; `nextCopy` counts repeats and ignores an expiry that a newer copy overtook; the effect restarts the timer on every result | `lib/copy.spec.ts` (hold lengths, repeat counting, stale expiry), `theme-radii.spec.ts` (the values); a browser run measured 2 001 ms, the pulse on a repeat and a restarted hold |
| `CPY-3` Copy the raw value | `CopyButton` takes `value: string` and never reads a node; `normalizeCopyValue` removes only what is invisible; `copyText` is the only write | `lib/copy.spec.ts` (every character class); `check-clipboard` fails a clipboard call anywhere else; a browser run pasted an IBAN that was displayed with hidden characters and got it without them |
| `CPY-4` Say it aloud (on `ACC-6`) | an always-mounted `role="status"` region with a keyed child; the button's `aria-label` never changes | a browser run read the region's text and the name before, during and after; no command checks it, and a real screen reader was not run |
| `CPY-5` Fall back, then fail out loud (on `FLO-7`, `ACC-8`) | `copyText` tries the async API, then `copyByCommand` from a scratch field inside the open `dialog`; both failing is the failed state with its sentence, 4 000 ms (`copyFailedHoldMs`), and `onFail` | `lib/copy.spec.ts` (order, synchronous fallback, dialog host, cleanup, every failure); a browser run on a real HTTP origin (`isSecureContext` false) copied through the command and a blocked clipboard showed the sentence |

---

## What this chapter does not settle

Five families are large enough to be their own chapters, because in this
product they are where the money is lost:

| Chapter | Prefix | Why it is separate |
|---|---|---|
| [11 · Workflow](../process-governance/11-workflow.md) | `FLO` | 100-step processes, approvals, state machines, resumption |
| [12 · Permissions](../process-governance/12-permissions.md) | `PRM` | thousands of permissions, 250+ roles, a page per person |
| [13 · Composition](../layout-composition/13-composition.md) | `MOD` | shipping ecommerce-only and ecommerce+CRM+ERP from one codebase |
| [14 · Navigation](../layout-composition/14-navigation.md) | `NAV` | hundreds of departments in one information space |
| [15 · Integrity](../process-governance/15-integrity.md) | `ITG` | dead ends, broken links and images, overflow — the mechanical risks |

---

## Sources

The laws above are not this system's invention. Where a ruling departs from
its source, the departure is stated in the entry.

- [Laws of UX — Jon Yablonski](https://lawsofux.com/) · [the 21 laws summarised](https://www.looppanel.com/blog/laws-of-ux)
- [Nielsen's 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [heuristics in infographics](https://www.uxtigers.com/post/heuristics-infographics)
- [Gestalt principles — IxDF](https://ixdf.org/literature/topics/gestalt-principles) · [a century of Gestalt psychology (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/)
- [Doherty threshold](https://lawsofux.com/doherty-threshold/) · [response-time limits](https://uxuiprinciples.com/en/principles/response-time-limits)
- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/) · [the nine new criteria](https://vispero.com/resources/new-success-criteria-in-wcag22/)
- [Optimal line length — Baymard](https://baymard.com/blog/line-length-readability) · [the 50–75 character rule](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)
- [The 8-point grid system](https://breakdance.com/the-8-point-grid-system-a-practical-guide/) · [8-point grid typography](https://www.freecodecamp.org/news/8-point-grid-typography-on-the-web-be5dc97db6bc/)
- [Material Design 3 — easing and duration](https://m3.material.io/styles/motion/easing-and-duration) · [Carbon — motion](https://carbondesignsystem.com/elements/motion/overview/)
- [Confirmation dialogs — NN/G](https://www.nngroup.com/articles/confirmation-dialog/) · [consequential options close to benign ones — NN/G](https://www.nngroup.com/articles/proximity-consequential-options/) · [managing dangerous actions — Smashing](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
- [Form design — Baymard](https://baymard.com/blog/form-design) · [never use inline labels](https://baymard.com/blog/mobile-forms-avoid-inline-labels)
- [Cognitive load in UX](https://www.designstudiouiux.com/blog/what-is-cognitive-load-in-ux/) · [progressive disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/)
- [Semantic colour tokens for enterprise design systems](https://www.aufaitux.com/blog/color-tokens-enterprise-design-systems-best-practices/) · [the 60-30-10 rule](https://www.sixtythirtyten.co/blog/60-30-10-rule-complete-guide)
- [UI localization best practices](https://simplelocalize.io/blog/posts/ui-localization-best-practices/) · [text expansion by language](https://localeproof.com/blog/text-expansion-by-language/)
- [Container queries in 2026 — LogRocket](https://blog.logrocket.com/container-queries-2026/) · [stop treating container queries like media queries — Smashing](https://www.smashingmagazine.com/2026/09/stop-treating-css-container-queries-traditional-media-queries/)
- [Data-ink ratio (Tufte)](https://www.holistics.io/blog/data-ink-ratio/) · [enterprise data tables — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) · [Stéphanie Walter on complex data tables](https://stephaniewalter.design/blog/essential-resources-design-complex-data-tables/)
