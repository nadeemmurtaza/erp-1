# 73 — Multi-entity configuration: the organization/brand/branch axes, already this repository's foundation

"Native setup controls within a single account to manage separate
corporate profiles, branches, or legal business units" is, structurally,
`CLAUDE.md`'s own three-axes model — **Organization**, **RetailBrand**,
**branch/`Location`** — stated as this repository's own binding
architecture, not a feature yet to build: "This repository serves several
sectors, several clients, and clients with several branches... A branch is
a point in time. A sector is a configuration. A brand is a value. A
location is a row." `organization.prisma` already defines `Organization`
(line 15, the account/tenant boundary) and `RetailBrand` (line 40, a
distinct corporate/legal profile under it), and `RETAIL-ERP.md`'s own R14
names the three deployment editions this exact model already spans —
**Solo** (one brand, one till), **Chain** (one brand, many branches, one
database), **Organization** (many brands, each a distinct legal entity,
under one account). This document is a coverage note connecting the
promotional request's own vocabulary to what already exists, plus one
honest naming of what is genuinely still configuration-time rather than
self-service.

## 1. What already exists, in the promotional list's own words

| Requested | Already exists as |
|---|---|
| "separate corporate profiles" | `RetailBrand` — a distinct brand with its own identity, resolved through `brand.ts` per Law 1, never a literal in application code |
| "branches" | `Location` rows (Solo/one database) or `Node`s with their own database (Chain/Organization scale, per `RETAIL-ERP.md`'s node-per-branch model) |
| "legal business units" | `RetailBrand`'s own tax label/number/currency fields (the exact "second legal entity" lens every prior document in this batch already answers per-domain: doc 60/61/63/68 each state "n/a, scoped per `organizationId`/brand exactly as X already is") |
| "within a single account" | `Organization` — the top-level tenant boundary every brand and branch already nests under |

## 2. The one honest gap: brand/branch creation is an admin operation today, not self-service onboarding

`CLAUDE.md`'s own standing rule states plainly: **"One deployment serves
one brand, resolved at build time. That is a deliberate boundary; do not
build toward multi-brand speculatively."** A single-brand *deployment*
(Solo, most Chain clients) never needs multi-brand self-service — there is
exactly one brand, configured once at setup, and Law 1 already forbids it
from ever appearing as an application-code literal. The Organization
edition, where a client genuinely operates several legal brands under one
account, is real, already-architected, and already the reason
`RetailBrand`/`Organization` exist as separate models rather than one — but
adding a *second* brand to an Organization-edition deployment, or a new
`Node` for chain-scale, is today an operator/deployment action (a
migration-adjacent, `DECISIONS.md`-level event, per the "the day a second
`RetailBrand` in a second country goes live" lens every relevant document
in this repository already answers by naming the fields, never by
promising a self-service button), not a screen an org admin clicks through
inside the product. Naming this honestly, rather than either overselling
"multi-company setup" as instantly self-service or leaving the boundary
unstated, is this document's own real contribution.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: `Organization`/`RetailBrand`/`Location`
are configuration entities, not actors.
**Whose rows, and which columns** — restated as the mechanism, not a gap:
every scoped query in this repository already carries `organizationId`
(and `retailBrandId`/`locationId` where relevant) per the three-axes
table's own standing rule — "an unscoped read" is explicitly listed as
something that must never happen, enforced today by code review (per
`ENTERPRISE-SCALE.md`'s own honest admission that branch-scoped reads are
not yet machine-enforced).
**The threshold nobody approves alone / The toxic pair** — n/a: no new
write path.
**Authority and blast radius** — who may create a second `RetailBrand` or
`Node` is, today, whoever has deployment/database access — not a
PBAC-gated in-app permission, because the action is not an in-app screen.
Naming this plainly is this document's own scope-lens answer, not a
deferral.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none** — n/a beyond what every other document in this batch (and every
prior batch) already answers per-domain, since this document introduces
no new write.
**The period that already moved / The second legal entity** — restated as
already-answered, repeatedly, across this repository's own documents (doc
60, 61, 63, 68 above, and every finance-adjacent document in earlier
batches) rather than re-derived here: every money-touching write already
states its `organizationId`/`retailBrandId` scoping.
**Dry run before live** — n/a: no computed rule.
**Three silhouettes** — restated as this document's own entire structure:
Solo is one brand, one database, no multi-entity concern at all. Chain is
one brand, many `Location`/`Node` rows, one legal entity. Organization is
several `RetailBrand` rows, each its own legal entity, under one
`Organization` — the exact silhouette progression `RETAIL-ERP.md`'s R14
already names, restated here because this promotional bullet is, in
effect, asking "does the silhouette progression exist" — it does.
**The absent collaborator** — n/a: `Organization`/`RetailBrand` are the
foundation every module in this repository already depends on; there is
no "off" state for them.
**The second copy of the write / The hundred-thousandth row / The
reversal document / The undo fan-out / The version stamp** — n/a: no new
write, no new table.
**The erasure the ledger cannot obey** — n/a: these are corporate/legal
entities, not personal data.
**The failure path** — n/a: no new operational failure mode; adding a
brand or node is an operator-run, deliberately deployment-time process
(the "second copy of the write" lens's own adoption-test discipline,
`documentNumber()`'s node-folding scheme, already accounts for a second
node appearing).

## Work orders

None against the schema or the write path — the model already exists.
**WO-73.1 (documentation only)** — if a genuine Organization-edition
client onboarding need for a lighter-weight "add a brand" admin flow ever
arises (rather than a deployment-time operator action), that is real,
separately-scoped future work, named here so it is tracked rather than
silently assumed to already exist as a self-service screen. No code
changes ship from this document.

## Acceptance

- No schema, permission, or UI change — verified by citation to
  `organization.prisma` lines 15/40 and `RETAIL-ERP.md`'s existing R14.
- This document is discoverable as the answer to "does multi-entity
  configuration exist" for any future reader of the promotional feature
  list, rather than that question going unanswered.

## Out of scope

A self-service "add a new brand" or "add a new node" in-app wizard — named
above as real, honestly-scoped future work, not built here; today's
correct, deliberate answer is that this is a deployment-time operator
action, per `CLAUDE.md`'s own standing "one deployment serves one brand"
boundary.
