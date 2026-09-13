# Working in this repository

Read this before writing code. It is loaded automatically for every agent
session opened anywhere in this repo, which is the point: the rules used to
live only in one person's private global config, so a teammate's agent, a
cloud run or CI saw none of them.

The long form is [`docs/implementation/00-HOUSE-RULES.md`](docs/implementation/00-HOUSE-RULES.md).
That file is the contract; this one is the part you must not miss.

---

## The seven laws

Binding on every surface — admin, storefront, customer account, mobile, API.
If a detail elsewhere disagrees with a law, the law wins.

1. **No hardcoding.** No brand, locale or design literal in application code.
   Colour, radius, type step, currency, dial code, timezone, company name,
   support address — every one resolves through an import from
   `packages/shared/src/brand.ts`. The only exception is Newax's own
   attribution and the `@newax/*` package scope.
2. **Hide complexity in depth.** Power is never removed, only moved. Nothing
   is deleted to make a page calm; it goes one level down.
3. **It should feel like there are only a few features.** The test the other
   laws serve. If a page makes the product look big, the page is wrong.
4. **Seven screens, no dead space.** `xs` 280 · `sm` 380 · `fold` 640 ·
   `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536. None may waste its space.
5. **One main job per page.** Two jobs is two pages.
6. **No clutter at all.** Ships when nothing visible could be removed.
7. **Overview first, detail on click.** Never render the detail of everything.

---

## Use what exists

Most drift here came from someone building a thing that already existed. Before
writing markup, check this list. **Grep for the literal before adding one.**

### Primitives — `apps/web/src/components/ui`

| Import | For |
|---|---|
| `PageHeader` | context, title, one line, ONE primary action |
| `Section` | a titled region with no box around it |
| `SectionRail` | parts of one object — all present, jump to any |
| `Tabs` | separate tasks on one object — one at a time |
| `Disclosure` | rare, advanced or destructive — closed by default |
| `MetricStrip` | a row of figures; give an item `detail` to make it open a panel |
| `DataTable`, `EmptyState`, `Badge`, `Button`, `Dialog`, `Loading` | as named |

Cross-surface: `components/common/status-badge` (**the** status pill — do not
write an eighth), `components/common/wizard`.
Storefront: `components/storefront/auth-page`, `legal-page`.
Admin: `components/admin/range-picker`.

### Classes — `apps/web/src/app/globals.css`

`.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-text`
`.card` `.chip` `.icon-btn` `.field-label` `.field-input` `.field-check`
`.field-inline` `.field-flat` `.notice` `.notice-error` `.notice-success`
`.notice-info` `.eyebrow` `.metric-strip` `.metric` `.table-flat` `.pill`
`.nav-link` `.nav-tab` `.prose-legal` `.lift` `.skeleton` `.stagger`
`.no-scrollbar` `.container-page`

### Everything else

| Concern | Import from |
|---|---|
| Money, dates, numbers | `@newax/shared` — `formatMoney` `formatDate` `formatDateTime` `formatDateShort` `formatNumber` |
| Brand, locale, theme | `@newax/shared` — `BRAND` |
| Routes | `@/constants/routes` — `ROUTES` |
| API calls | `@/lib/api-client` `request()`, `@/lib/admin-client` `adminFetch()` |
| CSV download | `@/lib/download-csv` |
| Storage keys | `@/constants/storage` |
| Permissions | `@/constants/permissions` |

**Never**: a bare `fetch` in a page · `toLocaleString` at a call site · a hex
in a component · a path literal in an `href` · English in customer-facing JSX
(use `apps/web/messages/*.json`) · a second palette · a hand-rolled alert,
status pill, table or modal.

---

## Borders and boxes

A border must mean something. Prefer whitespace and alignment.

**One border, soft, and never two.**

- **Never a box inside a box.** A bordered container directly inside another
  bordered container draws two lines a few pixels apart with nothing between
  them; the reader sees a seam, not a boundary. The inner one goes — a tint
  (`bg-neutral-50`) or plain spacing separates it just as well. This is the
  single most common way these screens get noisy: the wizard was a card, and
  every step inside it drew another.
- **Soft.** Container edges are `border-neutral-100` (#E8E8E8). Controls that
  have to be findable — inputs, checkboxes, the secondary button — get
  `border-neutral-200`, and nothing goes darker. A border is an edge, not a
  drawn line.
- **Never a border and a shadow on the same edge.** That is also two
  boundaries. `.card` has no shadow; `.lift` adds one on hover, when it means
  "this rose".
- A **card** must be a summary, object, status, action, warning or result.
  No decorative cards. A form that is the only thing on its page gets no box.
- A **table** is already a grid — `.table-flat` draws row rules and nothing
  else. No outer frame, no vertical lines, no zebra, and no `divide-*` on top
  of it.
- A **message** gets a tint, not a border — `.notice`.
- A **filter row** is controls, not an object. No box.

The one exception is a **control**, not a container: a segmented toggle whose
outline groups its buttons into one thing, or a dashed placeholder marking an
empty slot. Those may sit inside a card, because they are not claiming to be
a second container.

```bash
# Two bordered containers, one inside the other. Should print 0 beyond the
# two known controls.
python scripts/nested-borders.py
```

---

## Before you open a PR

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Both apps are currently at **0 errors and 0 warnings**. Keep them there.

Then verify by counting, not by reading — quote the number:

```bash
grep -rn "style={{" apps/web/src --include='*.tsx'          # inline styles
grep -rn "toLocaleString\|toLocaleDateString" apps/web/src   # stray formatting
grep -rn "await fetch(\|= fetch(" apps/web/src               # bare fetch
grep -ro "text-gray-[0-9]*\|bg-gray-[0-9]*" apps/web/src     # second palette
grep -rni "yaseen" apps/*/src packages/*/src --include='*.ts*' | grep -v '@newax/'
```

The last one must return only the two documented `LEGACY_*_COOKIE` constants.
Anything else is a rebrand leak — this codebase ships to multiple clients.

Legitimate remaining exceptions, so you do not "fix" them:

- inline `style` on data-driven widths and colours (bar charts, tree indents)
- inline `style` in `app/global-error.tsx` and `app/not-found.tsx`, which
  render before any stylesheet exists
- `any` in `*.spec.ts` — partial test doubles, allowed by eslint config.
  Production code gets no such exemption.

---

## Deployment

**Never push to `main`. Never push to `production`. Never merge into either.**
Both auto-deploy, so a merge is a deployment, and deployments are the owner's
decision. See §7 of the house rules.
