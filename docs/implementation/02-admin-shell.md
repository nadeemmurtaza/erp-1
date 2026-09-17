# Phase 2 — Admin shell and shared primitives

**Read `00-HOUSE-RULES.md` first.** Depends on WO-1.1 (declared group order).

## Why

There are 22 admin pages and **no shared UI components at all**. Every page
hand-rolls its own `<table>`, its own filter bar of `field-input` selects, its
own `StatusBadge` helper, its own pagination, and its own header block:

```tsx
<h1 className="mb-1 text-xl font-semibold text-ink">…</h1>
<p className="mb-6 text-sm text-ink/60">…</p>
```

That string is duplicated ~22 times. 16 pages contain a `<table>`; inventory and
settings contain two each. There are **zero modals** — every "modal" flow is an
inline expander or a side pane. Phase 1 adds nine more screens and Phases 3-9 add
around thirty. Without this phase, that is thirty more copies.

This phase adds no features. It is pure leverage, and it is worth doing before
the volume arrives rather than after.

## Rules for this phase

- **Composition, not configuration.** A `DataTable` that takes 40 props is worse
  than the duplication it replaces. Columns are an array of small objects; the
  cell renderer is a function. If a page needs something the component cannot do,
  the page renders its own table — that is allowed and better than a 41st prop.
- **Do not introduce a component library.** No shadcn, no MUI, no Radix wholesale.
  The design tokens in `apps/web/src/app/globals.css` (`.card`, `.btn-primary`,
  `.field-input`, the `brand`/`sand`/`ink` palette) are the system. Build on them.
  The one exception is a headless primitive for the modal's focus trap — see WO-2.3.
- **Migrate pages in batches, verifying each batch.** Do not convert 22 pages in
  one pull request.

## Work orders

| WO | Title |
|---|---|
| 2.1 | `PageHeader`, `EmptyState`, `Money`, `StatusBadge` |
| 2.2 | `DataTable` + `Pagination` |
| 2.3 | `Modal` + `ConfirmDialog` |
| 2.4 | `FilterBar` with URL-synced state |
| 2.5 | Migrate all pages onto the primitives |
| 2.6 | Command palette, breadcrumbs, collapsible groups |
| 2.7 | `error.tsx`, `not-found.tsx`, per-route loading skeletons |
| 2.8 | Permission-check cleanup |

All live in `apps/web/src/components/admin/ui/`.

---

## WO-2.1 — The small four

**`page-header.tsx`**
```tsx
<PageHeader
  title="Purchase orders"
  description="Everything on order from suppliers."
  actions={<Link href="/admin/purchase-orders/new" className="btn-primary">New order</Link>}
/>
```
Renders the exact markup pages use today so nothing shifts visually.

**`empty-state.tsx`** — icon, headline, one line of explanation, optional action.
Every list currently renders a bare "No results" or nothing at all.

**`money.tsx`** — `<Money value={349900} />` → `Rs 3,499`. Wraps `formatMoney()`
from `@newax/shared`. **After this exists, `/100` must never appear in a
component again.** Add an ESLint rule or a grep check in CI if you can.

**`status-badge.tsx`** — replaces the local `StatusBadge` helpers in
`products/page.tsx:222`, `orders/page.tsx` and `payments/page.tsx`. Takes a
variant (`neutral | info | success | warning | danger`) and **always renders the
label** — never colour alone. `stage-badge.tsx` already gets this right; follow it.

---

## WO-2.2 — DataTable and Pagination

```tsx
interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Right-align numbers. */
  align?: 'left' | 'right';
  /** Hidden below this breakpoint — tables must survive a phone. */
  hideBelow?: 'sm' | 'md' | 'lg';
  sortable?: boolean;
}

<DataTable
  columns={columns}
  rows={rows}
  rowKey={(r) => r.id}
  loading={loading}
  empty={<EmptyState … />}
  expandedContent={(row) => <MovementLedger variantId={row.id} />}   // optional
  onRowClick={…}                                                     // optional
/>
```

Requirements:
- Loading state renders skeleton rows, not a spinner that collapses the layout.
- `hideBelow` is not optional polish — the receiving sheet and the tailor queue
  get used on phones.
- Sorting is client-side over the given rows. Server-side sorting stays the
  page's job; the component only reports the requested sort.
- **Keyboard accessible**: real `<table>` semantics, `<th scope="col">`,
  expanders are `<button aria-expanded>`.

`Pagination` takes `{ page, pageSize, total, onChange }` and renders the existing
prev/next/page-count block.

---

## WO-2.3 — Modal and ConfirmDialog

There are no modals in the admin today, so there is no precedent to match — get
the accessibility right from the start, because everything after this copies it.

Non-negotiable: focus moves into the dialog on open and returns to the trigger on
close; `Escape` closes; focus is trapped while open; background scroll is locked
(`admin-shell.tsx:41-50` already has a body-scroll-lock effect for the mobile
drawer — reuse it); the backdrop is not the only way to dismiss; `role="dialog"`
with `aria-modal` and a labelled title.

Use a headless primitive for the focus trap rather than hand-rolling it. Either
the native `<dialog>` element or `@radix-ui/react-dialog` — a single package, not
a library. State the choice in the PR.

`ConfirmDialog` wraps it for destructive actions, requiring the consequence in
plain words ("This deactivates 3 variants. Past orders are unaffected.") and a
typed confirmation for anything irreversible.

---

## WO-2.4 — FilterBar with URL-synced state

Today filters live in `useState`, so a refresh loses them and a filtered view
cannot be shared or bookmarked. Staff work from these lists all day.

```tsx
<FilterBar
  filters={[
    { key: 'q',      type: 'search', placeholder: 'Search SKU or name' },
    { key: 'status', type: 'select', options: [...] },
    { key: 'low',    type: 'toggle', label: 'Low stock only' },
  ]}
/>
```

State lives in the URL query string via `useSearchParams` + `router.replace`.
Search input is debounced (300ms) before it touches the URL, and `replace` is
used rather than `push` so the back button does not walk through every keystroke.

Migrate `products`, `orders`, `inventory`, `contacts` and `leads` first — they
have the most filters and the most daily use.

---

## WO-2.5 — Migrate the pages

Four batches, each its own pull request, each verified before the next:

1. `products`, `inventory`, `orders`, `payments`
2. `contacts`, `leads`, `users`, `users/[id]`
3. `categories`, `garments`, `designs`, `import`
4. `stitching`, `stitching/bookings`, `settings`, `reports`, dashboard

Rules while migrating:
- **Behaviour does not change.** Same data, same actions, same permissions. If
  you find a bug, note it in the PR and fix it separately.
- Screenshot before and after. Visual drift is the failure mode here.
- Delete the code you replaced. A migration that leaves the old table behind
  "just in case" has achieved nothing.

---

## WO-2.6 — Command palette, breadcrumbs, collapsible groups

**Command palette (⌘K / Ctrl-K).** The real answer to a back office with 50+
screens. Sources: every `ADMIN_NAV` entry the user has permission for, plus
recent orders and products by number/SKU. Fuzzy match on label. This is the
single highest-value item in Phase 2 for daily users.

**Breadcrumbs** derived from the nav registry plus the route, rendered by
`PageHeader`. `Inventory & Supply → Purchase orders → PO-2026-0014`.

**Collapsible groups** in the sidebar, collapse state persisted to
`localStorage`, with the group containing the active route always expanded.

---

## WO-2.7 — Error, not-found and loading states

Today the admin tree has **no `error.tsx` and no `not-found.tsx` anywhere**, and
its single `loading.tsx` is shaped like the dashboard — so every page flashes a
dashboard-shaped skeleton before rendering something else entirely.

- `app/(admin)/admin/(app)/error.tsx` — recoverable error with a retry, and the
  digest shown so a support conversation can identify it.
- `app/(admin)/admin/(app)/not-found.tsx`.
- Replace the group-level `loading.tsx` with per-route skeletons that match the
  page. A list page gets table-shaped skeleton rows.

---

## WO-2.8 — Permission-check cleanup

Four pages test permissions with a raw string literal:
`(app)/account/page.tsx:8`, `(app)/page.tsx:65`, `(app)/stitching/page.tsx:33`,
`(app)/stitching/jobs/[id]/page.tsx:35`. All use
`getStoredUser()?.permissions.includes('…')` — so a typo is a silent
always-false, not a build error.

Meanwhile `useAdminSession()` in `components/admin/session.tsx:18` exists and has
**zero call sites**.

Do this:
1. Add a typed helper: `const { can } = useAdminSession()` where
   `can(key: PermissionKey): boolean`. The `PermissionKey` type makes a typo a
   build error.
2. Convert all four call sites.
3. Delete the local `ADMIN_LOCKED` array at `users/[id]/page.tsx:8` and import
   `ADMIN_LOCKED_PERMISSIONS` from `@newax/shared`.
4. Add a lint rule or CI grep banning `permissions.includes(` in `apps/web`.

---

## Phase 2 exit criteria

1. `grep -rn "<table" apps/web/src/app/\(admin\)` returns nothing.
2. `grep -rn "/ 100\|/100" apps/web/src/components/admin apps/web/src/app/\(admin\)`
   returns nothing.
3. `grep -rn "permissions.includes(" apps/web/src` returns nothing.
4. Every admin route has a matching loading skeleton; error and not-found exist.
5. ⌘K opens the palette and navigates.
6. Screenshots of all 22 pages, before and after, show no unintended drift.
