# 15 · Integrity

The mechanical failures — dead ends, broken links, missing images, overflow,
unreachable screens. The ones that are not matters of judgement, and are
therefore the ones a machine should be finding.

> **Status: five of ten built.** `ITG-2`, `ITG-3`, `ITG-5` and `ITG-11` are
> enforced by `pnpm lint` and by CI; `ACC-6` is enforced by eslint. `ITG-4`
> is enforced by its own CI job (`scripts/check-overflow.mjs`), separate
> from `pnpm lint` because it needs a running app. The five remaining checks
> that need a running app are still specified only.
>
> The reason this chapter exists is unchanged: every other chapter ends in
> "binding on review", which at 125 screens across four surfaces and seven
> shipping combinations is a promise nobody can keep by reading.

## Why this chapter is different

Chapters 00–14 are design judgement. A person decides whether a page does one
job, whether a motion communicates, whether a word is the right word.

The failures here are not judgement. **A link either resolves or it does
not.** A screen is either reachable or it is not. A layout either overflows
at 280 px or it does not. These have correct answers, they are checkable, and
every one of them is currently prevented by nothing but care — across a
surface far too large for care to cover.

The multiplier that makes this urgent: **seven shipping combinations × 250+
roles × seven widths × two locales.** Nobody tests that space by clicking. A
defect that appears only in "shop + CRM, viewed by a warehouse clerk, at
`fold`, in Urdu" will ship, and will be found by a customer.

---

## ITG · The laws

### ITG-1 · No dead end
**Here** — every screen and every state offers at least one forward action
and a marked exit (`FLO-1`, `HEU-3`). Including: empty states, error states,
permission-blocked states, absent-module states, and the end of every flow.

**Checkable as**: every route renders at least one enabled control, or a
purpose-built terminal state that links somewhere.

### ITG-2 · Every internal link resolves
**Here** — a link to a route that does not exist is a defect, not a
404-handling concern. In a modular product the common cause is not a typo —
it is a cross-module link valid in development, where every module is on
(`MOD-4`).

**Checkable as**: extract every internal href and route-push target; assert
each matches a route in the app router; assert each cross-module target is
registry-resolved.

### ITG-3 · Every image has a source, dimensions, and a fallback
**Here** — three separate failures, all of them shipped regularly:

- a path that does not resolve → a broken-image glyph;
- no intrinsic dimensions → the layout jumps when it loads, moving the button
  under the user's cursor;
- no fallback → user-supplied media (a product photo, a brand logo, an
  uploaded document) renders as nothing when it is missing, which is common.

**Checkable as**: every local image path exists on disk; every image element
carries width/height or an aspect ratio; every user-content image has a
declared fallback.

### ITG-4 · Nothing overflows at any of the seven widths
**Here** — Law 4 names `xs` 280 · `sm` 380 · `fold` 640 · `md` 768 ·
`lg` 1024 · `xl` 1280 · `2xl` 1536. **No horizontal page scroll at any of
them**, at 100% and at 200% zoom (`ACC-8`).

The usual culprits are known and can be looked for directly: fixed pixel
widths, unbreakable strings (a SKU, a long email, an IBAN), tables without a
scroll container, and `min-width` on a grid child.

**Checkable as**: render each route at each width and assert
`scrollWidth <= clientWidth`; statically, flag fixed widths above the
narrowest breakpoint.

### ITG-5 · Every screen is reachable by clicking
**Here** — `NAV-6`. A route not reachable from the nav registry, from another
screen, or as an object detail, is unshipped.

**Checkable as**: build the reachability graph from the nav registry plus
static links; assert no orphan routes. This one is pure graph work and needs
no browser.

### ITG-6 · Every page renders with every module absent
**Here** — `MOD-1`. The architectural rule has an interface twin and this is
it. Given the shipping combinations, this is the highest-value check in the
chapter.

**Checkable as**: for each supported `MODULES` combination, render every
route that should exist; assert no crash, no broken link, no reference to an
absent concept, and no empty region (`PRM-5`, `SPA-4`).

### ITG-7 · Every page renders at minimum privilege
**Here** — `PRM-3`, `PRM-4`. A page seen by its least-privileged legitimate
user is coherent, or it does not offer itself to them.

**Checkable as**: render each route with the smallest capability set its
declared contract permits; assert it is not reduced to chrome around nothing.

### ITG-8 · No layout depends on string length
**Here** — `GLO-1`. Text grows 30% in translation, and short labels far more.

**Checkable as**: pseudo-localisation — render with strings padded and
accented, then apply `ITG-4`'s overflow assertion. This is the highest-value
i18n technique and the most consistently skipped one.

### ITG-9 · Every user-visible string is translatable
**Here** — a literal in a component cannot be translated and violates Law 1.
Sentences are whole keys with named placeholders, never concatenated
(`GLO-6`).

**Checkable as**: flag string literals in JSX text positions and in
user-facing attributes; flag template concatenation around translation calls.

### ITG-10 · Colour is never the only channel
**Here** — `COL-2`.

**Checkable as**: partly. A component whose only difference between states is
a colour token is detectable statically; the general case needs a person.
Worth building for the detectable part.

### ITG-11 · Contrast meets its floor
**Here** — `COL-3`. Chapter 07 already records a known failure:
`neutral-100` (#E8E8E8) as a border does not reach 3:1 on white.

**Checkable as**: compute contrast for every token pair the system actually
uses, in both themes, and fail on a pair below its floor. This needs no
rendering at all — it is arithmetic over the token files, and it is the
cheapest check in this chapter.

### ITG-12 · Focus is never obscured, and never lost
**Here** — `ACC-2`, `ACC-3`. Sticky headers and footers are the common cause.

**Checkable as**: tab through each route and assert the focused element is
within the viewport and not covered; assert focus is non-null after each
overlay closes and each route change.

### ITG-13 · Nothing is reachable by hover alone
**Here** — `ACC-7`. Unreachable on POS and on mobile.

**Checkable as**: flag interactive elements whose only visible trigger is a
hover state.

### ITG-14 · A check that cannot run is a failing check
**Here** — the meta-law, and this repository already holds it:
`check-rebrand.mjs` exits 1 rather than passing when it cannot read the brand
file. Every checker below does the same. **A green build must never be able
to mean "this did not run".**

---

## The build order

Ranked by defects-caught per unit of effort, with what each needs. Nothing
here exists yet.

| # | Check | Built | Catches |
|---|---|---|---|
| 1 | **Contrast** (`ITG-11`) | ✅ `scripts/check-contrast.mjs` | a whole class of `COL-3` failures, including the one already known |
| 2 | **Route graph** (`ITG-2`, `ITG-5`) | ✅ `scripts/check-links.mjs` | broken links, orphan screens |
| 3 | **Image paths** (`ITG-3`) | ✅ `scripts/check-links.mjs` | broken images |
| 4 | **Accessibility lint** (`ACC-6`) | ✅ `eslint-plugin-jsx-a11y` | hand-written `aria-*` with nothing checking it |
| 5 | **Translatable strings** (`ITG-9`) | — static analysis | untranslatable literals |
| 6 | **Overflow at seven widths** (`ITG-4`) | ✅ `scripts/check-overflow.mjs` | the responsive failures Law 4 forbids |
| 7 | **Pseudo-localisation** (`ITG-8`) | — 6, plus padded strings | length-dependent layouts |
| 8 | **Absent-module render** (`ITG-6`) | — 6, plus a module matrix | the combination space nobody can click through |
| 9 | **Minimum-privilege render** (`ITG-7`) | — 6, plus capability contracts | hollow pages |
| 10 | **Focus integrity** (`ITG-12`) | — 6, plus a tab walk | obscured and lost focus |

```bash
pnpm check:contrast      # ITG-11 · also --self-test
pnpm check:links         # ITG-2, ITG-3, ITG-5 · also --self-test
pnpm lint                # runs both, plus the a11y rules
pnpm check:overflow      # ITG-4 · needs a running app · also --self-test, --skip-build, --only=<substring>
```

Checks 1–5 are static and fast, and belong in `pnpm lint` beside
`check-module-boundaries.mjs`, `check-frontend-secrets.mjs` and
`check-rebrand.mjs` — four of them now are. Checks 6–10 need a running app and
belong in CI as their own job: slower, and worth it.

### What the built four are honest about

Each one states its own blind spot rather than implying coverage it does not
have, because a checker trusted beyond its reach is worse than none:

- **Contrast** proves a ratio between two known colours. It cannot know which
  surface an element is actually on or how large its text renders — that needs
  check 6. Where a token clears the floor on *some* painted surface but not on
  the body surface, it reports rather than fails.
- **Links** resolve statically. A path assembled from a value the checker
  cannot evaluate is matched liberally, and a link rendered only under a
  condition is invisible to it.
- **Reachability** answers "does anything lead here", not "can *this person*
  get here" — that is `PRM-3`, and it needs checks 6 and 9.

### Declared debt, not silent passes

Both checkers carry a baseline: the failures that existed the day they were
written, each with a reason, and a count that may shrink but not grow. That is
this repository's existing pattern — `KNOWN_MODULE_COUPLINGS` and the module
checker's "1 known violation still to pay off" — and it is the difference
between a check that ships and a check that gets switched off.

The contrast baseline is worth reading — not for what it currently holds, but
for what it *used to*: it once recorded that the brand accent reached only
3.83:1 on white, so white-on-accent — the primary button across the whole
product — was under the 4.5:1 body floor. That was a brand decision (Law 1),
so the checker recorded it rather than silently changing it; when the decision
was made to darken the accent (same hue, in `brand.ts`), the entry came out
and the baseline shrank from 277 known-below-floor uses to 44 — every
remaining one a decorative boundary WCAG does not govern (`COL-3`).

**Sequencing note.** 5 is a normal work order. 6 through 10 share one
capability in their own right — a render harness, a route inventory, a module
matrix and a capability fixture set. Per `CLAUDE.md`, that is named and
sequenced here rather than stubbed or silently skipped. 6 is now built: the
render harness (`scripts/lib/render-harness.mjs`) boots the real api, web and
pos apps against a seeded database, signs in as admin/customer/POS operator,
and resolves fixtures for every dynamic route — 7 through 10 extend the same
harness rather than building their own.

---

## What a person still has to do

The checkers above will never cover these, and pretending otherwise is the
failure mode this chapter is written against:

- whether a page does **one job** (Law 5);
- whether anything visible could be **removed** (Law 6);
- whether a screen **wastes its space**, or rings its content around a void
  (`SPA-4`) — an overflow check proves nothing about emptiness;
- whether a word is the **right word** (chapter 06);
- whether a motion **communicates** (`MOT-1`);
- whether a workflow's states make sense to the person in the warehouse.

Chapter 09's second column is where those live, phrased as questions with
yes-or-no answers. The relationship between the two chapters is the whole
architecture of this system's quality model: **09 is what a person checks, 15
is what a machine checks, and neither is allowed to stand in for the other.**

---

## Sources

- [WCAG 2.2 (W3C)](https://www.w3.org/TR/WCAG22/) — the criteria behind `ITG-11`, `ITG-12`, `ITG-13`
- [UI localization best practices](https://simplelocalize.io/blog/posts/ui-localization-best-practices/) — pseudo-localisation, `ITG-8`
- [Text expansion by language](https://localeproof.com/blog/text-expansion-by-language/) — the 30–300% figures behind `GLO-1`
- [Container queries in 2026 — LogRocket](https://blog.logrocket.com/container-queries-2026/) — intrinsic layout, `ITG-4`
- [Responsive design beyond media queries](https://opendoordigital.dev/blog/responsive-web-design-2026)
