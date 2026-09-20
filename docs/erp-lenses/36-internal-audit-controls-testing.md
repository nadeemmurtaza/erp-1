# 36. Internal audit and controls testing

Solo and SME editions run on trust: one owner, little separation between
doing and checking. A corporate group cannot — regulators and its own audit
committee require named controls, periodic testing against samples, dated
remediation, and an internal auditor who can verify a control without
holding the power it governs. Invisible in a shop build, since there is only
one person to trust; at corporate scale it is the gap between an AuditLog
nobody structured and a framework an audit committee can actually rely on.

## Lens: The control has no name, only the fact does

**Question:** For each control your feature claims to enforce, what is the
row that names it — control id, description, the permission key(s) or
service method it governs, and the userId of the accountable owner — and
where does the AuditLog entry it produces point back to that row?

**Why:** `AuditLog` (`core.prisma:220-235`) is `action: String`,
`entity: String`, `entityId: String?`, `data: Json?` — a free-text fact per
event, with no `controlId` or `ownerId` column, and `AuditService.record()`
(`audit.service.ts:29-45`) accepts exactly that shape. Only 24 of 26 modules
call it, and only at call sites their authors chose. A control ("segregation
of duties over `payments.approve`", "period-close authorization") is a claim
that spans many actions and entities; nothing in the schema names it as a
row, so today "we have a control" means "we have some AuditLog rows a person
could read if they knew to look for them."

**Worked example:** Narrow slice: add `AuditService.record()` calls around
`FiscalPeriodsService.lockPeriod()` and call it "period-lock control
coverage." Complete capability: a `Control` row (id, name, ownerId, the
permission keys/methods it governs, testing frequency) that those audit
entries reference by `controlId`, so "every exercise of the period-lock
control" is a query on `Control`, not a grep of free-text `action` strings.

**Done test:** `grep -n "model Control" apps/api/prisma/schema/*.prisma`
returns a model with an `ownerId` and a governed-permission/method field, and
the PR's new `AuditService.record()` calls pass a `controlId` resolving to it.

**Breaks without:** At 100+ roles and 50+ permission keys, "which control
covers this action" is answered by institutional memory, not a query — a
sampling auditor has no table to sample from, and a control with no owner
row cannot be assigned a remediation.

## Lens: Testing is a record, not a query

**Question:** Where does a completed control test live as its own row —
tester id, the sample (which entity ids were pulled and how many), a result
per sampled item, and for each exception a remediation owner and due date —
separate from the AuditLog rows the sample was drawn from?

**Why:** `AuditService.record()` is fire-and-forget: its own comment says
write failures are logged, never thrown (`audit.service.ts:18-20`), and it
has no test-run identifier. No model in the 115-model schema is named
Control, AuditTest, AuditSample, AuditException or Remediation. The nearest
thing to a periodic sign-off is `FiscalPeriodsService.lockPeriod()`
(`accounting.prisma:91-106`, `LOCKED` is permanent) — a financial-close
action by whoever holds `accounting.manage_periods`, not a tester's
independent attestation that a drawn sample passed.

**Worked example:** Narrow slice: an auditor filters
`GET /settings/audit-log?entity=StockCount&from=...` and pastes findings
into a spreadsheet. Complete capability: a `ControlTest` row (controlId,
testerId, sampledEntityIds, periodCovered, result, exceptions each with
remediationOwnerId/dueDate) written through its own endpoint, so "was the Q3
stock-count control tested, and what failed" is answerable in-product.

**Done test:** the PR adds a model with a sampled-entity array/join and a
`remediationDueDate`-typed column, written by an endpoint gated by a
permission distinct from `audit.view`.

**Breaks without:** with 100+ locations and 10,000+ products, "prove the
count control was tested" becomes a manual export every cycle, exceptions
have no due date to miss, and there is no record that remediation ever
closed — only whatever the free-text AuditLog `data` field happened to hold.

## Lens: The auditor's key is not a master key

**Question:** Which permission key does control-testing/audit-read use, and
by what mechanism in code — not a policy document — is a user holding it
stopped from also holding a key for the operations that control governs
(`accounting.manage_periods`, `transfers.manage`, `inventory.manage`, …)?

**Why:** `audit.view` (`permissions.ts:221`) is flat and unscoped:
`SettingsAdminService.listAuditLog()` (`settings-admin.service.ts:87-113`)
builds its `where` from entity/actorId/date only — no `scopeFilterFor()`
call, so the endpoint is deployment-wide regardless of AdminScope.
`ADMIN_LOCKED_PERMISSIONS` (`permissions.ts:438-441`) is exactly
`settings.manage` and `roles.manage_permissions`; `audit.view` is not among
them, and nothing in `RolesService` or `PermissionsGuard.canActivate` (pure
OR over held keys) refuses a role holding both `audit.view` and an
operational key. No mutual-exclusion or separation-of-duties constraint
exists between any two permission keys anywhere in the codebase.

**Worked example:** Narrow slice: create a "Compliance" role with
`audit.view` and ship it. Complete capability: a role-save check that
refuses or flags a role combining an audit/control-test key with an
operational key over the same domain — e.g. `accounting.manage_periods`
plus audit rights over `FiscalPeriod` — the way
`assertLockedPermissionsStillHeldSomewhere` already refuses orphaning a
locked key.

**Done test:** `RolesService` has a function that rejects or flags a save
when a role's grant set holds both an audit/control-test key and an
operational key it is defined to cover, exercised by a spec.

**Breaks without:** an auditor role built as "`audit.view` plus whatever
else the admin also gave them" can verify and alter the same control, at
any of the 100+ roles a corporate group defines — internal audit stops
being independent, and nothing in the catalogue, guard or role editor would
ever flag it.

## Not modelled yet

- A `Control` model: name, owner, the permission key(s)/service methods it
  governs, testing frequency — no model in `apps/api/prisma/schema/*.prisma`
  is named Control.
- A `ControlTest`/sample/exception/remediation-date model — nothing between
  the free-text `AuditLog` fact stream and a spreadsheet an auditor keeps by
  hand.
- A management-attestation record, periodic and distinct from
  `FiscalPeriodsService.lockPeriod()`'s one-way financial close.
- Any mutual-exclusion or separation-of-duties check between permission
  keys — `RolesService` only refuses orphaning a locked key, never a
  conflicting combination.
- Scoped audit-log reads: `SettingsAdminService.listAuditLog()` calls no
  `scopeFilterFor()`, so `audit.view` is deployment-wide today with no
  per-brand or per-branch narrowing to hand a local auditor.
