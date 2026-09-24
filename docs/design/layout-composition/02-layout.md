# 02 · Layout and responsive

How a page is arranged, and how that arrangement survives seven screen widths.

Status: **breakpoints are built** (`apps/web/tailwind.config.ts`). The density
and reflow rules below are enforced by review.

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

## Multi-surface parity

Four front ends — `apps/web` (admin + storefront), `apps/pos`, `apps/mobile` —
share `packages/shared` and nothing else.

**Rules**
- A token belongs in `packages/shared`, never in one app's config, because the
  POS and mobile do not read `tailwind.config.ts`.
- The same concept keeps the same name and the same shape across surfaces. A
  status pill is `components/common/status-badge` everywhere, and there is
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
# No horizontal overflow and no nested boxes
python scripts/nested-borders.py

# Every Next app ships its error/not-found/global-error routes
for app in apps/web apps/pos; do
  for f in global-error.tsx not-found.tsx; do
    [ -f "$app/src/app/$f" ] || echo "MISSING: $app/src/app/$f"
  done
done
```

Reflow itself has no automated check today. Chapter 09 says what that costs
and what would fix it.
