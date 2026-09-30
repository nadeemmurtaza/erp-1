# ADR-025 — WO-E.2 is not executed: its own prerequisites (WO-A.1, WO-A.2) were never built, and building them now would be the same speculative-infrastructure trap ADR-019 already rejected

[← Decision log](../DECISIONS.md)


### Context
`10-admin-dashboard.md`'s WO-E.2 ("Retire superseded charts, add guards,
update docs") specs five things, every one of which assumes Track A
shipped first:

1. Delete `sales-chart.tsx` and `donut-chart.tsx`, "only after
   `compactRupees()` is confirmed ported into `chart-theme.ts`" — i.e.
   after WO-A.2 built a `recharts`-based replacement
   (`components/admin/charts/{time-series,comparison,category-bar,share,
   sparkline}-chart.tsx`, `chart-theme.ts`, `chart-data-table.tsx`,
   `scripts/check-chart-imports.mjs`, the `recharts` dependency itself).
2. Enforce that `recharts` is imported only from `components/admin/charts/`.
3. Eliminate every `permissions.includes(` in `apps/web/src`, "achieved by
   A.1's `can()`" — a permission-check helper WO-A.1 was to introduce.
4. Confirm no division-by-100 remains under `components/admin/charts/`.
5. Add a dated note to `04-finance.md` recording that its WO-4.5 rule — "Do
   not add a charting library — those three files are inline SVG and match
   the design system" — was deliberately overridden.

Before starting, the same check ADR-019 ran for Track A's registry
infrastructure was re-run for WO-A.1 and WO-A.2 specifically:
`apps/web/src/components/admin/charts/` does not exist;
`scripts/check-chart-imports.mjs` does not exist; `recharts` is not a
dependency in `apps/web/package.json`; no `can()` permission helper exists
anywhere in `apps/web/src`. Neither work order was ever built — this
session's Track A work stopped exactly where ADR-019 described it: two
hand-authored screens, four existing inline-SVG chart components, no
registry, no `can()`, no chart library.

What does exist, and is live: `sales-chart.tsx` and `donut-chart.tsx`,
each rendered from three real, currently-shipping screens —
`/admin` (the main dashboard), `/admin/insights`, and
`/admin/finance/expenses/analytics` (built this session, WO-B.4). Every
screen built across Tracks B, C, D and E.1 this session — roughly forty
admin pages — uses `getStoredUser()?.permissions.includes('…')` as its
permission check, because that is the only mechanism that has ever existed
in this codebase; `apps/web/src/app/(admin)/admin/(app)/page.tsx`'s own
TAILOR-redirect check (leaned on directly in WO-E.1) is one of the 31
current call sites. `04-finance.md`'s "do not add a charting library" rule
is accurate to the codebase today — no charting library was ever added, so
there is nothing to record as overridden.

### Options Considered
1. **Build WO-A.1 and WO-A.2 now, then execute WO-E.2 as specced.**
   Rejected for the same reason ADR-019 rejected building a minimal slice
   of WO-A.4/A.5 for WO-B.4: it would introduce two new architectural
   layers — a `recharts`-based chart library with its own theme, its own
   accessibility contract, its own import-boundary lint script, and a
   codebase-wide `can()` permission abstraction replacing 31 call sites
   across every module — as a side effect of a work order whose own text
   is "retirement," not "build." Nothing downstream of E.1 asked for a
   second charting vocabulary or a permission-check refactor; both would
   be built solely to satisfy this WO's own acceptance criteria, which is
   the "unused abstraction" and "no real boundary justifies its existence"
   trap `CLAUDE.md` names directly.
2. **Delete `sales-chart.tsx` / `donut-chart.tsx` anyway, replacing their
   three call sites with something ad hoc.** Rejected outright: the
   dashboard, `/admin/insights` and the WO-B.4 expense-analytics screen
   would lose their charts with nothing put back, which is a regression on
   three live, shipped screens — not a retirement of something superseded,
   since nothing supersedes them.
3. **Do the parts of WO-E.2 that do not depend on A.1/A.2, skip the rest,
   record why.** Checked each of the five items individually:
   - Chart retirement (#1) and the `recharts` import boundary (#2): both
     require WO-A.2's unbuilt replacement. Skipped.
   - `permissions.includes(` elimination (#3): requires WO-A.1's unbuilt
     `can()`. This is actually WO-2.8 in `02-admin-shell.md`
     ("Permission-check cleanup"), an earlier, separately-specced,
     similarly never-built work order — not something WO-E.2 itself
     defines. Building it now would be the same speculative-build-to-
     satisfy-an-AC pattern as option 1. Skipped.
   - Division-by-100 check (#4): `components/admin/charts/` does not
     exist, so the check is vacuously satisfied — there is nothing under a
     nonexistent directory to divide by 100. Not a change; just a fact.
   - The `04-finance.md` dated note (#5): would misrepresent history —
     nothing was overridden, so noting an override is false documentation.
     Not written.
   Chosen: this option, which in practice is "no code change."

### Decision
WO-E.2 is not executed. No files are deleted, no dependency is added, no
`can()` helper is introduced, and `04-finance.md` is left as-is because its
existing rule is still true. Track E ends at WO-E.1.

### Reasoning
WO-E.2's title is "retire superseded" — a retirement work order has no
honest content when the thing it retires was never superseded. Every other
work order this session that found its Track A prerequisite missing (B.4,
B.5, D.1–D.6, E.1) had a real, present-tense gap to fill and filled it
against the codebase's actual live idiom instead of the unbuilt registry.
WO-E.2 has no such gap: its acceptance criteria are entirely instructions
to delete, restrict, or document things that depend on infrastructure this
session's own prior decisions (ADR-019, and now this one) declined to
build without a concrete requirement driving it. Building that
infrastructure now, solely to make a deletion-shaped work order have
something to delete, inverts "Feature scope: build the whole capability"
into building a feature nobody asked for so a housekeeping ticket can
close.

### Consequences
- `sales-chart.tsx`, `donut-chart.tsx`, `gauge-chart.tsx` and
  `funnel-chart.tsx` remain the codebase's one and only charting
  vocabulary, exactly as `04-finance.md` WO-4.5 already specifies. Any
  future chart need keeps using them, the same way WO-B.4 and WO-B.5 did
  this session.
- The 31 `permissions.includes(` call sites remain untouched; this is
  `02-admin-shell.md`'s own tracked WO-2.8, not something this ADR
  resolves or claims to resolve.
- If a real future requirement needs a second chart type these four
  inline-SVG components cannot express (e.g. a true multi-series
  time-series with zoom, which `sales-chart.tsx` does not attempt), WO-A.2
  should be scoped and built then, against that requirement — not
  speculatively now.
- `10-admin-dashboard.md` itself is not edited by this ADR; it remains the
  planning document, and its Track A / WO-E.2 text is still accurate as a
  *plan that was not built*, which is exactly what ADR-019, ADR-020 and
  this entry each independently confirm.

### Status
**Accepted.**
