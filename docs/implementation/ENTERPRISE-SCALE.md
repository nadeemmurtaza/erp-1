# Scaling this repository: sector, brand, branch

**Read `00-HOUSE-RULES.md` first, then `MULTI-SECTOR.md`.** This file is the
layer above both: it names the three axes this product is expected to grow
along, states the rule for each, and — at the end — lists honestly which of
those rules a machine currently enforces and which rely on review.

A rule nobody checks is a preference. The last section is the important one.

---

## The three axes

Almost every "can it also do X?" question is one of three, and they are
answered in three different places. Confusing them is how a codebase ends up
with a branch per client.

| Axis | The question it answers | Varies by | Lives in | Never |
|---|---|---|---|---|
| **Sector** | *What kind of business is this?* | clothing, grocery, pharmacy | a module pack + the `MODULES` allowlist | a git branch, a fork, an `if (sector === …)` |
| **Brand** | *Which business is this?* | name, colours, currency, contact | `packages/shared/src/brand.ts` | a literal in application code |
| **Branch** | *Where did this happen?* | a shop, a warehouse, an outlet | a `Location` row on the movement; at chain scale, a node with its own database | an unscoped read, or stock replicated as a total |

> A branch is a point in time. A sector is a configuration. A brand is a value.
> A location is a row. Keep each one in its own kind of place.

---

## S — Sector rules

The full reasoning is in `MULTI-SECTOR.md`. These are the rules it implies,
stated so they can be checked.

**S1. One `main`, one `production`. No per-sector or per-client branch.**
A configuration must never be encoded in time. See MULTI-SECTOR "The ruling".

**S2. Adding a sector adds a folder.** It does not edit a core module. If
supporting a new sector requires changing `orders` or `cart`, the change
belongs behind an extension point, not inside them.

**S3. Core never imports a pack; a pack never imports another pack.**
Enforced by `scripts/check-module-boundaries.mjs` for both TypeScript imports
and `.prisma` relations.

**S4. Every pack must be survivably absent.** A deployment booted with that
pack missing from `MODULES` has to start, serve, and pass its health check.
A core module that breaks without a pack is a boundary violation that the
checker did not catch.

**S5. Extension points, not conditionals.** There is no `if (sector === …)`
anywhere, and there must never be. A core module that needs pack behaviour
declares a registry under `apps/api/src/core/extension-points/` and the pack
registers into it from its own `onModuleInit()`.

**S6. A recorded violation is a debt with an owner, not a permanent exception.**
`KNOWN_VIOLATIONS` entries fail the build once they stop firing, so a fixed
violation cannot rot in the list. Adding one requires a comment saying what
would remove it.

---

## Br — Brand rules

**Br1. One deployment serves exactly one brand.** The brand is resolved at
build time from `brand.ts`. This is a deliberate boundary, not an oversight:
it keeps every formatter, template and asset path a static value, and it is
why a rebrand cannot leak between clients.

**Br2. No brand, locale or design literal in application code.** Colour,
radius, type step, currency, dial code, timezone, company name, support
address, document prefix. The only exception is Newax's own attribution and
the `@newax/*` package scope.

**Br3. A rebrand is a value change plus artwork.** If it requires editing
logic, the logic was wrong. The test before writing any literal: *would this
differ for another client, in another country, or after a redesign?*

**Br4. Brand is not copy.** A rebrand changes who the page is about; it must
not be able to change what the page *says*. Customer-facing words are
translation rows.

**Br5. Check the least convenient surface first.** If the API and the mobile
app cannot import the web app's config, anything in that config is already
forked — whether or not the copies currently agree.

### When Br1 would have to change

Serving several brands from one deployment is a different product, and these
are the signals that it has become necessary:

- a client wants sub-brands with different customer-facing identities on one
  order book, or
- the per-deployment cost stops being justifiable per client.

At that point brand becomes a request-scoped value resolved from the host,
every formatter takes it as an argument, and `brand.ts` becomes the default
rather than the answer. **Do not build toward this speculatively.** Until one
of those signals is real, the static brand is the cheaper correct design.

---

## L — Branch (location) rules

`Location` already exists, and stock is tracked per location through
`VariantLocationStock` and `StockMovement`. What does not exist is any
guarantee that a reader is confined to their own branch.

**The architecture of record for multi-branch is [`RETAIL-ERP.md`](./RETAIL-ERP.md)**
— Organization ▸ Brand ▸ Branch ▸ Box ▸ Till, with the reasoning behind every
rule below and the roadmap that builds them. This section states the rules; that
document explains why they are the ones that converge.

**L1. Every movement of value names its location.** Stock movements, counts,
receipts and transfers carry a `locationId`. A movement without one is a bug,
not a default.

**L2. A query that can span branches must say so.** Either it is scoped to a
named location, or it is explicitly cross-branch and its caller holds a
capability that permits that. There is no implicit "all branches" read.

At chain scale the mechanism changes and the rule does not. A branch runs its
own database, so isolation *inside* a branch becomes structural rather than
defensive — a branch query cannot read another branch's rows because they are
not there. The scope guard's job moves up rather than away: it now governs the
brand and organization panels, where every branch's rows genuinely do sit in one
database and an unscoped read is once again a hole. See `RETAIL-ERP.md` R10 —
three admin levels, one permission catalogue, and a scope.

**L3. Location is never inferred from the user's last action.** It comes from
the request, the record, or an explicit selection — never from session state
that a second tab can desynchronise.

**L4. A branch is a node, not a tenant.** A branch has its own database and its
own admin panel, and it is authoritative for its own facts — its sales, its
stock, its cash, its local purchases. What it holds of the brand's catalogue,
prices, promotions and staff is a read-only cache it may not edit. That is not
tenancy; a branch is part of one brand and reports into it.

The tenancy boundary is the **brand**, and it is Br1. Two businesses that must
not see each other's customers are two brands, each its own deployment — never
two branches with a filter between them.

> This rule previously said the opposite: that branches share a database, a
> catalogue and a customer list by design. That was written for one shop with a
> back room, before the chain topology existed, and `RETAIL-ERP.md` Part 1
> supersedes it. It is recorded here rather than deleted because a rule that
> quietly reverses is worse than one that says it changed.

**L5. Aggregates state their scope in their name.** `totalStock` is a lie when
there are four warehouses. `stockAtLocation`, `stockAcrossBranches` — the
signature should make the wrong reading hard to write.

**L6. Facts up, policy down, ledgers merge, nothing sideways.** Every table is
exactly one of those three classes, and its class decides which way it
replicates and who wins a conflict:

- a **fact** — a sale, a return, a payment, a goods receipt, a journal line —
  flows up only, and the node that recorded it always wins. Append-only, never
  rejected, never edited from above.
- a **policy** — a product, a price, a tax rate, a user, the chart of accounts —
  flows down only, and the owning tier overwrites.
- a **ledger** — stock on hand, an account balance, cash in drawer — never
  replicates as a total. Only its deltas move; every tier recomputes its own sum.

A brand admin cannot edit a branch's sale; they post a correcting fact. A branch
cannot edit a brand's price; it can request one. Shipping a total instead of its
deltas is how every naive sync corrupts stock, and shipping a balance is how it
corrupts accounts. `RETAIL-ERP.md` R2.

## D — Data rules

**D1. Migrations are forward-only and tested against a copy of production
data**, not against a fresh database. A migration that only works on an empty
schema has not been tested.

**D2. Never `prisma migrate dev` against production.** It can reset the
database.

**D3. Every destructive or money-moving action is audited**, with the actor,
the entity and what changed.

**D4. Money is integer minor units everywhere.** No floats, no currency maths
in the UI.

**D5. One writer per invariant.** Stock moves through `InventoryService.move()`
and nothing else. When a second writer appears, the invariant is already
broken — it just has not been observed yet.

---

## P — Permission rules

**P1. Permissions are capabilities, not roles.** A route requires
`orders.refund`; which roles hold that is data, editable at runtime.

**P2. A route with no `@RequirePermission` is authenticated-but-unrestricted.**
That is almost never intended, and it is the default failure mode when someone
adds a controller in a hurry.

**P3. The UI hides what the user cannot do, and the API refuses it anyway.**
Hiding alone is decoration.

---

## What is actually enforced today

The honest part. Anything in the right column is a rule that depends on a
human noticing.

| Rule | Enforced by | Status |
|---|---|---|
| S3 core↛pack, pack↛pack (TS and Prisma) | `scripts/check-module-boundaries.mjs` in `pnpm lint` | **machine** |
| S6 stale recorded violations fail the build | same checker | **machine** |
| Br2 no brand/locale literals | greps in `CLAUDE.md`; no CI gate | review |
| D4 integer minor units | types only where `toMinor`/`toMajor` are used | review |
| P1 capabilities | `@RequirePermission` decorator | machine, where applied |
| P2 every route decorated | `scripts/check-route-permissions.mjs` in `pnpm lint` | **machine** |
| S4 pack absence survivable | nothing; no boot test per `MODULES` set | **review — gap** |
| L1 movements carry a location | schema requires it on `StockMovement` | machine, partially |
| L2 branch-scoped reads | **nothing** | **not enforced — gap** |
| L3 location never from session | nothing | review |
| L6 facts up / policy down, ledgers as deltas | `RETAIL-ERP.md` R2; no node exists to enforce it yet | **not built — planned** |
| `NODE_ROLE` boot validation | `RETAIL-ERP.md` R1; planned for `core/config/env.validation.ts` | **not built — planned** |
| D1 migration tested on prod copy | checklist in §3 of the house rules | review |

### The gaps worth closing first

1. **L2 — branch-scoped reads.** Today any signed-in user with an inventory
   capability can read every location's stock. For one shop with a back room
   that is fine. For a client with four outlets it is a data-isolation hole,
   and it is invisible until somebody notices a number they should not have
   seen. The design already exists in `16-pbac-row-scoping.md`; it was
   deliberately deferred, and this is the axis that makes it due.

2. **S4 — pack absence.** Nothing proves a grocery deployment boots. The
   boundary checker proves the *imports* are clean, which is necessary and not
   sufficient: a core module can still read a table only a pack creates. One
   CI job per representative `MODULES` set would close it.

3. ~~**P2 — undecorated routes.**~~ **Closed.**
   `scripts/check-route-permissions.mjs` runs in `pnpm lint` and fails on any
   route that does not state its access. Sixteen routes were undeclared when
   it was first run — all of them legitimately "any signed-in user, own rows
   only", none of them a hole — and they now say so with
   `@AuthenticatedOnly()`. That decorator changes nothing at runtime; it
   exists so a reviewer can tell a decision from an omission, which is
   precisely what the checker could not do either.

   Worth recording: the checker's first two versions reported 48 and then 42
   findings, both wrong. It read decorators by scanning upward, and this
   codebase writes `@Get()` above `@RequirePermission(...)`; then it resolved
   class-level guards per *file* rather than per class, so every route in a
   file's second controller looked unguarded. A checker that cries wolf is
   worse than no checker, because the next person learns to skip it.

Neither of the remaining two is urgent for a single-shop, single-sector deployment. All three
become urgent on the first multi-branch client, and the order above is the
order they bite.

4. **`NODE_ROLE` and the replication direction check — not started.** These
   are `RETAIL-ERP.md` Tranche 1 work, not yet begun: `NODE_ROLE`/`NODE_ID`
   boot validation (R1) and a check that a fact-class table never accepts a
   write claiming to be policy, or vice versa (R2). Listed here so this table
   stays honest once Tranche 1 lands — until then, L6 is a rule with no
   machine behind it, same as L2.
