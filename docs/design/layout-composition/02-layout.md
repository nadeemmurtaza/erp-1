# 02 · Layout and responsive

How a page is arranged, and how that arrangement survives seven screen widths.

Status: **breakpoints are built** (`apps/web/tailwind.config.ts`), on a scale
whose names differ from Law 4's (the table under "The seven screens" maps one
onto the other). The seven widths are swept in CI by `check-overflow`; the
density and reflow rules below are enforced by review.

## The page skeleton

Every admin page is the same three parts, in this order, and a page that
invents a fourth should explain why:

1. **`PageHeader`** — context, title, one line of explanation, and **one**
   primary action. Two primary actions means the page has two jobs, which
   means it is two pages (Law 5).
2. **The work** — the table, form, or detail that is the page's actual job.
3. **Secondary depth** — `Tabs` for separate tasks on one object,
   `SectionRail` for parts of one object, `Disclosure` for the rare and the
   destructive.

## Hierarchy: where the eye goes

Two laws from the owner's hierarchy reel (2026-10-02), **HIE**. The reel's third
point, one loud button (the brightest thing on the screen is the destination),
is already `PER-9` (one first stop; a second primary button is a bug) and
`COL-4` (the accent is for the primary action and the current selection), so it
is not restated here. `COG-12` and `TYP-4` are what these two stand on.

### HIE-1 · One headline
**Here** — each screen has one largest piece of text, and it names the page's
job: the `PageHeader` title, the page's `h1`. Nothing else on the first screen
is set at its type step or above, so the title is read first, always: size
opens the door. A page that exists to show one figure (a till total, a
balance) may give that figure the largest step instead, but never both at
once: two things at the top of the scale is a coin toss for the eye. Everything
below the headline is ranked by weight and colour, not by more size (`TYP-4`),
which also keeps it cheap in vertical space.

**The test** — at 1280 px, count the elements set at the title's type step or
larger. One. And the element the eye lands on first is the one that names the
job.

### HIE-2 · Three stops
**Here** — from the headline to the action the eye stops at most three times:
the headline, the content the action is about, and the action. A fourth stop is
a competing region. Remove it, move it one level down (Law 2) or quiet it;
never answer it by making the action louder, because then the page has two
things shouting. The action is the page's one loud button (`PER-9`, `COL-4`)
and its label is the verb the headline promised ("Get started", "Send
invoice"). A table page passes the same test: its title, its table, its one
create action. A filter row and a tab strip are controls, not stops.

**The test** — name the three stops aloud for this page. If you cannot, or you
need a fourth, the page has two jobs (Law 5). Then ask someone who has never
seen it to point at the action: if that takes more than a glance, a stop is
missing or a fourth one is competing.

## Grid

There is no twelve-column grid and there should not be one. Layout here is
flow and a small number of deliberate splits:

- **Single column** is the default, and is correct more often than it looks.
- **List + detail** — the dominant ERP shape. The list narrows before the
  detail does.
- **Form + summary** — the form leads; the summary is secondary and collapses
  below at `md`.

**Rule.** A column exists because content needs it, not to fill width. Law 4
forbids wasted space; it does not require stretched space.

## Density

An ERP table and a storefront product page have different correct densities.
Neither is "the" density, and copying one into the other is a common failure.

| Surface | Density | Why |
|---|---|---|
| Admin tables, POS till | tight | the user scans many rows and acts fast |
| Admin forms, detail panels | medium | the user reads and types |
| Storefront | generous | the user is browsing, not working |
| Mobile | medium, never tight | touch targets set the floor (Chapter 07) |

**Rule.** Density is set by the surface and never by the component. A `Badge`
looks the same everywhere; the space around it changes.

## The seven screens

```
xs 280 · sm 380 · fold 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536
```

Law 4: **none may waste its space.** That cuts both ways — a layout that is
unusable at `xs` fails, and one that is a narrow column of text at `2xl` fails
too.

`xs` at 280 and `fold` at 640 are not decoration. 280 is a genuinely small
Android device, and `fold` is the inner screen of a folding phone, which is
why it sits between `sm` and `md` rather than being folded into either.

**These are the widths a page must work at, not the Tailwind prefixes.**
`apps/web/tailwind.config.ts` names a different scale, and a builder who writes
`sm:` expecting the law's 380 gets 640:

| Prefix in code | Starts at | First law width it applies to |
|---|---|---|
| none (the base styles) | 0 | `xs` 280: below the first prefix, the base layout alone must work |
| `xs:` | 380 | `sm` 380 |
| `sm:` | 640 | `fold` 640 |
| `fold:` | 672 | none: the sweep's 640 sits below it, so 672 to 767 is never swept |
| `md:` `lg:` `xl:` `2xl:` | 768, 1024, 1280, 1536 | the same name and width |

The config's `fold` was retuned to 672 against measured devices (a Z Fold
opened into tablet mode is about 673 to 717 px wide); the law's round 640
predates that. Renaming the config (every `xs:`, `sm:` and `fold:` utility in
the codebase) or restating the law is an open decision, recorded in ADR-083's
consistency addendum with the harness comment that first named it.

## Reflow rules

In order of preference, because the first preserves the most meaning:

1. **Reorder** — the same elements, stacked differently. Cheapest, safest.
2. **Collapse** — a secondary column becomes a `Disclosure` or moves below.
3. **Substitute** — a table becomes a list of cards. Only where the table's
   columns genuinely do not fit; a horizontally scrolling table is usually the
   better answer for an ERP, because the user is comparing rows.
4. **Hide** — last resort, and only for genuinely redundant chrome. Hiding a
   capability at a breakpoint violates Law 2: power is moved, never removed.

**Never** a horizontal page scroll. A table may scroll inside its own bounds;
the page may not.

**Where rule 3 applies, it is `DataTable`'s `stacked` prop** — opt-in, so no
existing table changes. Below `md` each row becomes a card (the first column is
its title, every other column a label and a value); from `md` it is the same
table. Use it for a list whose rows are read one at a time — a person, an audit
entry, an import row — and leave it off where rows are compared against each
other, which is what the rule above already says. The planned admin screens in the admin-platform design spec (it lives on
another branch, see ADR-083's fourth addendum) name five such lists; `/admin/design-system#patterns` shows it at every width.

## Multi-surface parity

Four front ends — the admin and the storefront (both in `apps/web`),
`apps/pos` and `apps/mobile` — share `packages/shared` and nothing else.

**Rules**
- A token belongs in `packages/shared`, never in one app's config, because the
  POS and mobile do not read `tailwind.config.ts`.
- The same concept keeps the same name and the same shape across surfaces. A
  status is `components/common/status-badge` (a `Badge`) everywhere, and there is
  never an eighth one.
- A surface may omit a capability. It may not rename or restyle one it has.

## The POS is a different animal

`apps/pos` is a till, used standing up, at speed, possibly on a touchscreen,
possibly offline. It is the one surface where the usual instincts are wrong:

- Targets are larger than the web minimum, not equal to it.
- The primary action is reachable by thumb, not by mouse.
- **Offline is a normal state, not an error.** A sale that has happened is
  never rejected (RETAIL-ERP.md R5), so the interface must show *queued*
  rather than *failed* — see Chapter 04.
- Receipts are printed. Print is a real output surface here, with its own
  constraints: no colour, no shadow, fixed narrow width.

## Verifying

```bash
pnpm check:overflow            # ITG-4: no horizontal overflow at the seven widths (own CI job; needs a seeded stack)
python scripts/nested-borders.py   # nested boxes: 0 beyond the two known controls (ui.md, "Borders and boxes")
```

The check that every Next app ships its error, not-found and global-error
routes is the snippet in `.claude/rules/ui.md` ("No dead ends"); it is kept in
one place. Reflow is checked at the seven widths, but a page that wastes its
width without overflowing is not: chapter 09 says what that costs and what
would fix it.
