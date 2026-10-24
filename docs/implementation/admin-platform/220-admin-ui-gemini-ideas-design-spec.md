# 220 — Admin UI design spec: the Gemini idea set, mapped onto this repo

Status: **Planned** (design only; no code changed by this document).
Task type: design / docs. Document of record for the screens below until each
one ships; each ships under its own work order.

## Objective

A brainstorm (Gemini transcript) proposed ~15 admin screens as Vue 3 + Quasar
snippets. This repo is **Next.js 15 + React 19 + Tailwind 3** (`apps/web`), so
none of the snippets can be pasted. This spec extracts the *idea* in each,
says what already exists, what is genuinely missing, and what the screen must
look like under the seven laws (`CLAUDE.md`) and the design system
(`docs/design/`). Nothing is added to the stack (no Quasar, no Vue).

## How the snippets conflict with house rules (applies to every screen)

| Snippet habit | Rule it breaks | Replacement |
|---|---|---|
| `bg-blue-600`, `text-gray-500`, `bg-red-50` | Law 1 (no design literal), "second palette" grep | tokens / classes from `brand.ts` + existing primitives |
| "Newax Technologies", "Lawn & Looms", `+92…`, `Asia/Karachi`, `$` | Law 1 | values resolved from `brand.ts` / settings |
| `mock` arrays in `<script>` | no fake data | API-backed, with empty/loading/error states (design law: every state shipped) |
| `if role === …`, hard-coded role lists | capabilities not roles | `PERMISSION_CATALOG` keys |
| Separate `audit_logs` table written in the controller | one writer per invariant | existing `AuditService` (`audit.view`) |
| `req.ip` + raw SQL `INSERT` | services rules | service layer, `Logger`, no raw SQL |
| Regions as free text strings | scope axes | `Location` / org-structure units |
| Cron in n8n deleting expired rows | resilience | enforcement at read time **and** a sweeper; n8n is optional, never load-bearing |

## Existing state (verified by reading routes/permissions, not by running the app)

| Idea | Existing surface | Gap |
|---|---|---|
| Bulk user onboarding | `/admin/users`, `/admin/contacts/import`, `/admin/import` (catalog CSV, template download) | no staged, editable validation grid for **users** |
| Role assignment + effective-access preview | `/admin/users/[id]` (456 lines) | preview-before-save of the delta to verify |
| Temporary access | `/admin/org-structure/[unitId]/access` issues time-boxed grants (`expiresAt`, reason, countersign; `org.access.grant`) | grants are per org unit; time-boxed **role** for a user (auditor) not verified — confirm before designing UI on it |
| Company profile | `/admin/settings` (1,423 lines, one page), `/admin/brands` | split by job; per-card edit |
| Publish + audience | `/admin/segments`, `/admin/campaigns` | audience builder with partner flag, region, live count |
| Products & services feed | `/admin/products`, `/admin/managed-services` | syndication/publish-state view |
| Users page | `/admin/users` | exists |
| Audit viewer | permission `audit.view` exists | dedicated viewer route not found in UI index — confirm |
| Own profile | `/admin/account`, `/admin/account/api-keys` | sessions list, 2FA — confirm |
| Departments + roster | `/admin/org-structure` (+ per-unit access) | roster bulk assign, export |
| One-click invoice | `/admin/invoices` | row action + delivery status |
| Pixel motion | none | purely decorative; see §10 |

## Shared layout contract (Law 4, 5, 7)

Seven widths: xs 280 · sm 380 · fold 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536.

- **Table screens**: at `< md` rows become stacked cards (name, one status, one
  action); `md` shows 4 columns; `xl+` shows all. Never horizontal page scroll.
- **Drawers** become full-screen sheets below `md`; side panel from `md`.
- **Bento** is 1 column `< md`, 2 at `md–lg`, 3 at `xl`; at `2xl` content is
  capped and centred, not stretched (no dead space = use the width for a
  second column of *detail*, never empty margin).
- Every screen ships: loading, empty, error, forbidden (layout closes over a
  missing permission), partial-module-absent.
- One main job per page; a second job is a second route.

## 1. Bulk user import (`/admin/users/import`)

**Job:** turn a CSV into N users, safely.
**Flow:** 1 Upload (drop zone + template download) → 2 Review grid → 3 Commit.
- Parse in the browser; validate against the same schema the API uses
  (shared zod/DTO in `@newax/shared` if present; otherwise the API validates
  authoritatively and the grid only pre-checks — client checks are never the
  gate).
- Grid: one row per record, status column (Valid / Error / Duplicate), error
  text under the offending cell, inline cell edit re-validates that row only.
  Filter chips: *All · Errors · Duplicates*. Overview-first: header shows
  `48 ready · 2 need attention`; errors sort to top.
- Commit button disabled while `errors > 0`, label states the count. Commit is
  a **server job** with a per-row result (created / skipped / failed), shown
  as a downloadable result CSV; partial failure never silently drops rows.
- Dependency note: CSV parsing library needs the `dependencies.md` checklist;
  reuse whatever `/admin/import` already uses first.
- Permission: `users.manage`. Nav: child of Users.

## 2. Access panel + effective-access preview (`/admin/users/[id]` → tab)

Three blocks, in this order, and only block 1 visible by default (Law 2):
1. **Assignment** — roles (multi), scope (branch/`Location`/unit).
2. **Effective access preview** — diff, not a dump: *Gains* / *Loses* chips
   grouped by module, computed from the permission catalogue; unchanged
   permissions collapsed ("214 unchanged"). Toxic-pair refusals (from
   `RolesService`) shown inline and block Save.
3. **Direct overrides** (collapsed "Advanced") — single permission grants with
   mandatory expiry + reason.
Merge rule is additive across roles (stated in the UI help text).
Save is one request; the audit row carries old and new values.

## 3. Temporary access

**Screen:** in the assignment block, a "Ends" control: *Never · In 48 h · Pick
date & time* (timezone shown, resolved from settings not hard-coded).
**Must-decide before build (ADR in `DECISIONS.md`):** whether this extends the
existing org-unit time-boxed grant or adds expiry to the role assignment.
**Enforcement (both layers):** expiry filtered at permission-resolution time
(so the next request is denied) plus a sweeper that marks rows ended and
notifies. Sweeper failure must not extend access.
**Auditor experience:** persistent, non-dismissible slim banner "Access ends
in 1 d 4 h" (counts down; turns warning under 1 h; announces to screen readers
at thresholds, not every second). On expiry: next action shows a dedicated
"Access ended" page, not a raw 403. Reaching it is a record, not a request.

## 4. Company profile (`/admin/settings/company`)

Split from the 1,423-line settings page: this page's single job is legal
identity.
- Hero card: logo, trading name, status.
- Bento cards: **Legal & tax**, **Address**, **Contact**. Each card has its
  own Edit → inline fields → Save/Cancel; only one card editable at a time;
  unsaved-change guard on navigation.
- Tax fields are labelled from brand/country config (a second legal entity in
  another country must change the label, not the code). Changing a tax
  identifier requires `settings.manage`-class permission and writes an audit
  row with old/new value.
- Closes for holders of view-only: read mode, edit buttons absent (not
  disabled-with-no-reason).

## 5. Publish profile + audience builder

Extends `/admin/segments`; "publish" lives on the campaign/profile, not in a
new module.
- **Step 1 Visibility**: Internal · Unlisted (token link, revocable) · Public.
- **Step 2 Audience**: segment cards (Retailers, Distributors, Customers,
  Institutions — labels from the party-type model, not literals), each with a
  *Partner only* modifier; region multi-select from org-structure/`Location`;
  *Include inactive* in Advanced.
- **Live count**: debounced (300 ms), shows "≈ 1,420 accounts", with a
  *View the list* link to the exact filtered rows (click-the-number rule).
  Count request is cancelled on change (abort previous), shows stale-state
  shimmer, and degrades to "count unavailable — you can still save" on error.
- Audience = saved segment definition (JSON rules), versioned, so a campaign
  records which version it used.
- Geo radius/PostGIS: **not assumed present**. Verify the database has the
  extension and spatial columns before any design depends on it; region-by-unit
  works without it.
- Permission: reuse existing segments/campaign keys; add none until a gap is
  proven.

## 6. Products & services feed

`/admin/products` already lists products; add a **Channels** lens, not a new
page: per row, where it is published (storefront, POS, partner feed) and why
not (no price, no stock, hidden). Services appear via `managed-services`
under the same filter chip set *All · Products · Services*. Row click opens a
drawer (quick price/publication edit). Virtualised list at 10k+ rows; server
side search and pagination (findability lens).

## 7. Users page

Already present. Changes only: filter chips (role, status, scope), a status
dot with text (colour is never the only signal), bulk select with floating
action bar (Suspend, Change scope) that states the count and confirms
destructive actions; link "Add user" and "Import" as one split button.

## 8. Audit log viewer (`/admin/audit`)

Job: answer "who changed what, when". Filter bar (actor, target, action type,
date range), table (time, actor, action, target, summary), row expands to a
before/after diff. Read-only, no edit/delete affordances anywhere.
Export is server-side, permission `audit.view`, and itself audited.
Pagination by cursor; indexed on target and time (verify indexes exist).

## 9. Own profile (`/admin/account`)

Tabs: Preferences · Security · API keys (existing). Security: password change,
MFA enrolment, **active sessions with per-session revoke**. Role/scope shown
read-only. Tokens are shown once at creation and stored hashed (already the
pattern in `163-personal-api-keys.md`).

## 10. Departments + roster

Use `/admin/org-structure` as the tree (departments are org units); do not
create a parallel `departments` table. Unit page: roster table with multi
select; floating bar: *Move to…*, *Remove*. Removing never deletes a user,
only the posting; confirm states the count. Export CSV via existing export
pattern; PDF only after the dependency checklist. Weekly emailed rosters are
a scheduled job owned by the API's jobs module (`docs/index/cross/jobs.md`),
audience resolved from a permission + scope, **never a literal address**;
n8n may be a delivery channel, not the scheduler of record.

## 11. One-click partner invoice send

Row action on `/admin/invoices`. Optimistic "Sending…" → "Sent" only when the
server acknowledges; idempotency key per (invoice, recipient, version) so a
double click or retry sends once; status shows Queued / Sent / Delivered /
Bounced with a *Resend* action on failure. One click means no modal **unless**
the partner has no verified billing address, in which case the button explains
and links to the partner record. Permission: existing invoice send key.

## 12. Pixel motion (decorative)

Not in the seven laws' spirit (Law 3/6: nothing that adds clutter). If kept:
only on the public storefront hero, never in admin; respects
`prefers-reduced-motion` (falls back to the static image); paused off-screen;
one canvas per page; no effect on LCP (static image first, enhance after
load). Motion tokens from `docs/design/motion`. Low priority; last work order.

## Implementation plan (sequenced work orders)

1. WO-A bulk user import (§1) — backend job + grid.
2. WO-B access preview + overrides (§2) and ADR for §3 expiry model.
3. WO-C temporary access enforcement + auditor banner (§3).
4. WO-D audit viewer (§8) and session management (§9).
5. WO-E company profile split (§4).
6. WO-F audience builder + live count (§5).
7. WO-G roster bulk actions (§10), channels lens (§6), invoice send (§11).
8. WO-H pixel motion (§12), optional.

## Acceptance criteria (per screen)

- Usable without horizontal scroll at all seven widths.
- Loading / empty / error / forbidden states present.
- Reachable: nav entry, real permission seeded to a role a live user holds.
- No colour, brand, currency, locale or address literal (`pnpm check:rebrand`,
  the four greps in `CLAUDE.md` at zero).
- Keyboard-operable; status never colour-only; `pnpm check:contrast` passes.
- `pnpm lint && pnpm typecheck && pnpm test` pass.

## Scope lenses (summary; each WO repeats its own)

- Movement with no address — n/a: no stock/cash writes; §5 scope is a `Location`/unit id.
- Second legal entity — §4 tax label/number resolved per brand, not per code.
- Second copy of the write — §1 commit and §11 send carry idempotency keys.
- Absent collaborator — §10 scheduling works without n8n; §5 works without PostGIS.
- Hundred-thousandth row — §8 audit and §6 feed use cursor/server pagination.
- Erasure — §1 results CSV and §8 audit diffs hold personal data: name the retention in the WO.
- Undo fan-out — §3 expiry reverses automatically; §1 import is undone by per-row deactivate (human, `users.manage`).

## Out of scope

Vue/Quasar, new design tokens, a separate audit table, a geo/ads platform,
the pixel shader library.

## Open questions for the owner

1. Is time-boxed **role** assignment wanted, or are org-unit time-boxed grants
   (already built) sufficient for auditors?
2. Is PostGIS available in production Postgres, and is radius targeting wanted
   at all, given unit-based regions?
3. Is n8n part of the deployed stack for customers, or only your own?
