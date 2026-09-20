# 31. Training, documentation and the first hundred users

A capability nobody can be taught is not shipped. At Solo scale two staff
learn the product by using it; at Org scale a hundred named roles each see a
slice, a branch goes live weeks after the org does, and a trainee must be
able to act without touching real stock or real ledgers. The code has no
landing logic, seed data, rollout state or guidance text built for that — it
has one for two roles and one branch, correct at Solo, silently wrong above
it.

## Lens: The landing page assumes two roles

**Question:** For every role this deployment defines — not just the ones
with `analytics.view` — what URL does a fresh login land on, and what does
`navFor()` leave that user able to click once they get there?

**Why:** `landingFor()` (`apps/web/src/components/admin/nav-registry.ts:358-361`)
is a binary: `analytics.view` sends a user to `/admin`, anyone else to
`/admin/stitching`. `navFor()` (L373-387) then filters `ADMIN_NAV` to items
the user's permissions and enabled modules allow. At Org scale a warehouse
picker, area manager, driver or internal auditor typically holds neither
`analytics.view` nor any stitching permission — they land on a queue they
cannot act on, filtered down to nothing.

**Worked example:** Narrow slice: ship the two-branch check already in
`landingFor()` unchanged. Complete capability: a landing resolved from the
role's own permission set — the first `navFor()` item it can actually reach —
so a picker holding only `inventory.count` lands on `/admin/inventory`, not
a stitching queue with no permission to touch.

**Done test:** PR traces, for each new role it ships, which `landingFor()`
branch it hits and pastes the resulting `navFor()` output showing at least
one actionable item — not merely that login succeeds.

**Breaks without:** A new hire's first click at any of a hundred locations
is a queue with zero permission to act on — a support ticket every onboarding
day, not once.

## Lens: Demo data has one persona

**Question:** Name the seed rows (table, id prefix, count) a trainee playing
warehouse picker, area manager or internal auditor would see on first login,
and what happens in the ledger when they act on one.

**Why:** `apps/api/prisma/seed.ts`'s demo records (`STO-DEMO-0001..0003`,
`JOB-DEMO-0001..0005`, ~L2798-2860) are one persona's workflow — stitching
orders and jobs for a single tailor-facing flow, seeded once, un-tagged as
demo beyond the string prefix. Nothing seeds a picker's pick list, an
auditor's evidence trail, a multi-branch area manager's dashboard, or
franchise/B2B data — the actor kinds the ground brief lists as required at
Org scale.

**Worked example:** Narrow slice: append more `STO-DEMO-*` rows when a
stitching feature ships. Complete capability: a named, taggable sandbox
dataset per actor family (retail ops, warehouse, franchise, audit) a trainee
is dropped into and can safely act on, identifiable and wipeable without
touching production-shaped rows.

**Done test:** PR states which actor-family dataset it adds, by seed
function name, and greps `seed.ts` for a demo marker (e.g. a `-DEMO-`
prefix or `isDemo` convention) proving the new rows are tagged, not mixed
in un-marked.

**Breaks without:** Training runs on a single tailor-shop scenario for a
role that never touches a stitching job — either real records get corrupted
by trainees practising, or most of a hundred roles are trained on a screen
with nothing relevant to their job.

## Lens: Going live has no state

**Question:** When a branch finishes training and is switched on, what
field changes, who may flip it, and what does every screen reading
`Location` today do differently for a branch that exists but is not yet
live?

**Why:** `Location` (`apps/api/prisma/schema/inventory.prisma:76-106`)
carries only `isDefault` and `isActive`, both operational flags —
`isActive` already means "eligible for stock/transfer/reorder logic," not
"staff here are trained." There is no provisioning/training/live state
distinct from it, so a branch mid-rollout is either fully live — untrained
staff posting real stock — or invisible to every query that reads
`isActive`.

**Worked example:** Narrow slice: flip `isActive` true the day hardware
arrives. Complete capability: a rollout state on `Location` gating which
nav items and pickers surface that branch, so branch 47 trains without its
till appearing in branch 46's transfer source picker.

**Done test:** PR names the field/model carrying rollout state and shows
one caller — e.g. `InventoryService.defaultLocationId()`
(`inventory.service.ts:166`) or a transfer source picker — now excluding or
flagging a non-live `Location`.

**Breaks without:** A trainee's practice sale at an unlaunched branch posts
a real stock movement and a real journal entry — `AccountingService.postEntry()`
is the only writer and has no training mode — or a live branch never
appears anywhere because nothing ever flips a state that does not exist.

## Lens: Permission with no explanation

**Question:** For a permission key a trainee's role meets for the first
time, what text explains what it unlocks, and does every surface gating on
that key read the same string, or does each write its own?

**Why:** `PermissionDefinition` (`packages/shared/src/permissions.ts:38-43`)
is exactly `{key, label, category, sensitivity}`. `label` is a short
admin-UI string ("View dashboard analytics"), not guidance — there is no
`description`, `helpText` or `docsUrl` field, and no stated translation-key
convention for one, so permission-gated guidance copy has nowhere to live
once written.

**Worked example:** Narrow slice: hardcode a tooltip string beside one new
nav item's component. Complete capability: a guidance field (or
translation-key convention) keyed to the permission itself, so every
surface gating on `inventory.count` renders the same locale-correct
explanation without a per-component copy fork.

**Done test:** PR resolves the new guidance text through a translation-file
lookup keyed by the permission's `key`; grep for a hardcoded label string
added inside a `.tsx` component for that permission returns none.

**Breaks without:** A hundred roles' first encounters with a feature get
explained inconsistently or not at all, each locale or rebrand forking the
copy independently — the "two globals for the same thing" failure the
user's own globalization rules name as worse than none.

## Not modelled yet

- No rollout/enablement state on `Location` or `Node` — only `isActive`/
  `isDefault` and `ACTIVE`/`SUSPENDED` exist, both operational, not
  training/go-live state.
- No per-role or per-actor-family sandbox dataset — `seed.ts`'s demo rows
  are single-persona, permanent, and not tagged for identification or
  wipe.
- No guidance/help-text field anywhere in the permission catalogue —
  `PermissionDefinition` carries `label` only, a UI string, not
  explanatory copy, and no translation-key convention for one is stated.
- No training-completion or first-run-tour record on `User` or
  `UserRoleAssignment` — nothing to gate an onboarding walkthrough by the
  permission set a role actually holds.
