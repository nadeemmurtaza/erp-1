# 228 — Roles, permissions and configuration

> **Industry-specific module.** This belongs to the **housing-society sector pack** (real estate / society management), not to `core`. It is enabled only in housing-society deployments through the `MODULES` allowlist; other sectors never load it, and core never imports it.
>
> **Status: Planned.** Reuses core `users`/`roles`/PBAC. Adds this pack's
> permission keys, role presets, and the **configuration model** that lets one
> codebase serve a *new project* or an *existing society*.

## 1. Access model

Permissions are **capabilities, not roles** (`CLAUDE.md`). Roles are bundles
of keys, edited by the society. Three audiences:

| Audience | How authenticated | Scope |
|---|---|---|
| **Admin / management** | `User` | all projects; approvals; settings |
| **Staff** | `User` + `Employee` | project(s) and sales office(s) they are assigned (org-tree scope, doc 21) |
| **Members** | portal login | own rows only — never a staff permission |

### Role presets (data, seeded; societies edit freely)

| Preset | Holds (examples) |
|---|---|
| Admin | everything incl. `society.settings.manage` |
| Manager | bookings/billing/receipts view + approve within band |
| Sales | bookings create, plots hold, members manage |
| Accounts | receipts record, vouchers, reports.finance, billing.adjust |
| Records | property.manage, members.manage, documents |
| Complaints officer | complaints.handle/assign |
| Gate guard | visitors.record only |

**Presets are only the first grant.** A permission that exists in
`PERMISSION_CATALOG` but reaches no role a real user holds is scaffolding, not
shipped: each work order seeds its keys into the real seeding path
(`seedPermissions()` **and** the role grant), the known trap in this repo.

## 2. Separation of duties (toxic pairs)

Refused together in `RolesService.create/update`, with the reason shown:

* `society.bookings.create` + `society.bookings.approve`
* `society.receipts.record` + `society.receipts.reverse`
* `society.vouchers.create` + `society.vouchers.approve` + `society.vouchers.pay` (any two of three in one role beyond a configured level)
* `society.billing.rules` + `society.billing.waive`

Per-act checks (executor ≠ approver, recorder ≠ reverser) compare the actor to
the stored user id on the row.

## 3. Scope: whose rows, which columns

Every list, export, schedule and drill-down is filtered by the actor's
project/sales-office scope. Sensitive columns (identity numbers, bank
details, nominee shares) are masked unless `society.members.sensitive`. **There
is no implicit "all projects" read** — an admin's "all" is explicit and audited.

## 4. Configuration: one codebase, two starting points

| Starting point | What happens |
|---|---|
| **New project** | Setup wizard: society profile → project/phase/block → plot generator → price list & payment plans → charges & late-fee rule → chart of accounts template → roles → go live. Skip anything and it is configured later; nothing blocks. |
| **Existing society** | Same wizard **plus** the Excel import (doc 229) bringing members, plots, bookings, installments, receipts and opening balances; ends with a reconciliation report that must be accepted before go-live. |

Everything that varies by society is **data**, never a branch or an `if`:

* terms and labels (Project/Scheme, File, Plot/Unit), size units, plot kinds;
* payment plans, charges, late-fee rule, approval bands (all versioned);
* receipt/letter templates, numbering prefixes, brand;
* which optional modules are on (`MODULES`), which integrations are connected;
* revenue-recognition policy and COA edits (with accountant sign-off recorded).

A change to any of these records old and new value, the actor, and a version;
records already created keep the version they were made under.

## 5. Member portal switches

On/off per society; each portal capability (view statement, raise complaint,
create visitor pass, request transfer, pay online) is a separate flag, off by
default until the office decides — nothing is hidden in code.

## 6. The grant that ends itself

Staff access ends with deactivation or `hr.posting_ended`; in the same
transaction their pending approvals return to the role's queue (never silently
to another person), their sessions revoke, and gate/shift passes expire at
shift end. Nominee authority carries `expiresAt`.

## 7. Acceptance criteria

1. A user with `bookings.create` cannot be granted `bookings.approve` in the same role (test).
2. A staff user scoped to Project A sees zero Project B rows on every list and export.
3. A permission added by a work order is held by at least one seeded real role (test over the catalogue).
4. A new society can reach "first receipt recorded" through the wizard with no developer help.
5. Changing a late-fee rule leaves existing installments unchanged and records a versioned audit row.

## 8. Permissions

`society.settings.manage`, `society.roles.manage` (existing roles module key
reused where it fits), `society.portal.view`, plus every key named in docs 221–227.

## 9. Work orders

228.1 permission catalogue + presets + seeding through to roles · 228.2 toxic
pair enforcement · 228.3 scope filters · 228.4 setup wizard · 228.5 portal
switches · 228.6 deactivation transaction.
