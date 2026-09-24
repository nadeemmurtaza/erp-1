# 48 — Native desktop deployment for continuous-connectivity-free businesses

`apps/pos` is already offline-first — a PWA with its own outbox, built
exactly for a till that loses connectivity mid-shift. That is not what this
document is for. "Businesses without continuous internet connectivity" (a
shop with no reliable line at all, not one that occasionally drops for an
hour) is a different scale of absence than doc 38's "four hours down" — it
is days or weeks, and a PWA whose API server is simply never reachable is
not offline-first, it is broken. The honest fix is not a thicker browser
wrapper; it is making the desktop install **a real node**, per
`RETAIL-ERP.md`'s own model — the identical architecture a branch already
gets, packaged to run on one machine with no server room behind it.

## The decision this document does not make casually

Two shapes exist for "the desktop app has its own data," and this is
exactly the class of choice `DECISIONS.md` exists to record once actually
built, not settled by a paragraph here:

1. **Embed a real Postgres** (a bundled, managed local instance) — the
   `apps/api` schema and every module run completely unmodified; the
   desktop app IS an `apps/api` process plus its own Postgres, wrapped.
2. **A lighter embedded store with a translation layer** (SQLite, a
   Prisma driver adapter) — smaller install, more moving parts, and a
   second database engine this repository's `EXPLAIN ANALYZE`/index
   discipline would need to separately prove correct.

**This document assumes (1)** for one concrete reason: it needs zero new
application code. `apps/api`'s existing module system, permissions, and
every business rule already work against Postgres; a desktop node running
a real, embedded Postgres inherits all of it for free. Reopening this for
(2) needs a real, measured reason (install size, resource limits on real
target hardware) recorded as its own `DECISIONS.md` entry before a line of
it ships — not assumed here either way beyond stating why (1) is the
default.

## 1. A desktop install is a node, exactly as a branch already is

```
Desktop app (Electron/Tauri shell)
  ├── apps/api, unmodified — same modules, same permissions, same schema
  ├── an embedded, managed Postgres instance — started/stopped with the app
  ├── apps/pos and/or apps/web's admin console, served locally
  └── the SAME replication client RETAIL-ERP.md's Chain nodes already use,
      syncing FACTs up and PolICY down whenever a connection exists
```

`NODE_ROLE=BRANCH`, `PARENT_URL`/`PARENT_API_KEY` pointed at whatever
central office exists (or entirely unset, for a true single-location
business with no parent to sync to at all — `RETAIL-ERP.md`'s own Solo
edition, already designed to need no parent). **This document adds zero
new replication logic** — the entire value it delivers is packaging and a
managed local Postgres lifecycle, on top of architecture that already
exists and is already proven.

## 2. What packaging actually adds, beyond "it's Electron now"

- **Local Postgres lifecycle**: start on app launch, healthy-check before
  serving traffic, graceful shutdown on quit, and a backup routine that
  runs locally (`deploy/backup.sh`'s own restore-tested discipline,
  doc 38, adapted to a single-machine schedule instead of a VPS cron).
- **First-run setup**: a wizard that runs the equivalent of
  `db:migrate deploy` + `db:seed` once, locally, on first launch — never
  requiring a terminal.
- **Update delivery**: the desktop shell's own auto-update mechanism
  updates the application binary; the database migration that ships with
  a new version runs automatically on next launch, forward-only, exactly
  `00-HOUSE-RULES.md`'s existing migration discipline, never a destructive
  reset.
- **Native hardware access**: doc 31's `ReceiptPrinter`/`CashDrawer`
  drivers gain a native (non-WebUSB) implementation where the desktop
  shell can talk to a serial/USB device more directly than a browser
  sandbox allows — an additional `DeploymentProvisioner`-shaped
  implementation of doc 31's own interfaces, not a new hardware model.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: the desktop node runs the same
`apps/api` auth unchanged; no new actor.
**Whose rows, and which columns** — unchanged from every other node:
branch-scoped reads, exactly `RETAIL-ERP.md`'s existing rule.
**The threshold nobody approves alone / The toxic pair** — n/a: no new
authority introduced.
**Authority and blast radius** — who may install/reinstall the desktop
app on a given machine (a physical-access control, not this codebase's to
enforce — named as an operational responsibility, same as doc 39's
hosting-operator boundary); the worst value is an uncontrolled local
Postgres superuser password, mitigated by generating a random one per
install, never a shared default.
**Audience is a capability, not an address** — n/a.
**Request or record** — unchanged: every write still classifies exactly
as it does on a server-hosted node; packaging changes nothing about what
a request or a record is.
**The movement with no address** — unchanged: `locationId` is still
required on every stock/cash write, the desktop node's own `Location`.
**Four hours down** — restated as this document's whole reason to exist,
extended past four hours to indefinitely: a desktop node with no parent
reachable for weeks keeps recording every fact locally and simply has a
longer replication backlog once connectivity returns — R5's own rule,
unchanged, at a longer timescale.
**Click the number** — unchanged: every figure the desktop node's own
admin console shows still drills down into its own local rows exactly as
a server-hosted deployment's does.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — unchanged: the desktop node
runs the identical accounting/posting rules a server-hosted node does.
**Dry run before live** — n/a beyond what every other document in this
set already establishes for its own pure functions, all of which run
unmodified on this node too.
**Three silhouettes** — Solo: the primary case this document serves — one
machine, no parent, everything local. Chain: a branch's desktop node
syncing to a real parent when connectivity exists. Organization: less
likely a fit (a group with many branches usually justifies real
connectivity), named as a real possibility, not assumed as the target
case.
**The absent collaborator** — a desktop node with `PARENT_URL` unset
behaves exactly as a Solo deployment already does — zero code path
changes for "no parent," since that configuration already exists and is
already tested.
**The second copy of the write** — unchanged: the same idempotent-outbox,
same `@@unique` constraints, same replication dedup every other node
already relies on; packaging introduces no second write path.
**The hundred-thousandth row** — a single-machine embedded Postgres has
real, lower resource ceilings than a dedicated server; this document
names it as a real constraint (document the tested machine spec/row-count
ceiling once measured) rather than assuming server-class performance on a
retail counter's PC.
**The reversal document / The undo fan-out / The version stamp** —
unchanged from every other node's own existing rules.
**The erasure the ledger cannot obey** — unchanged: the desktop node's
local database is subject to the identical erasure/retention rules a
server-hosted one already states; a lost or stolen machine is a real
physical-security incident this document names but does not solve (full-
disk encryption at the OS level is the operator's own responsibility, not
this codebase's).
**The failure path** — a local Postgres that fails to start on launch
surfaces a real, readable error (not a blank window) with a "repair/
restore from last backup" action, reusing doc 38's own restore-tested
discipline at single-machine scale.

## Work orders

**WO-48.1 — embedded Postgres lifecycle**: bundle, start/health-check/
stop, random local credential generation per install.
**WO-48.2 — Electron/Tauri shell**: wraps `apps/pos` (and/or the admin
console) as the app's own window; the choice between the two frameworks
is a `DECISIONS.md` entry of its own once resourced, weighing bundle size,
native-module support (for WO-48.4's hardware access) and cross-platform
build tooling — not settled here.
**WO-48.3 — first-run setup wizard**: migrate, seed, `NODE_ROLE`/`PARENT_URL`
configuration with no terminal required.
**WO-48.4 — native hardware drivers**: doc 31's `ReceiptPrinter`/
`CashDrawer` interfaces, implemented via the shell's native module access
instead of WebUSB.
**WO-48.5 — local backup**: a scheduled local dump + restore-test, doc 38's
own RPO/RTO discipline adapted to single-machine cron equivalents.
**WO-48.6 — auto-update**: binary update + automatic forward-only
migration on next launch.

## Acceptance

- A fresh install, with no terminal use, reaches a working till within the
  setup wizard's own steps.
- The app functions fully — sales, stock, reports — with the network
  cable unplugged for the length of a normal business day, and syncs its
  backlog once reconnected.
- A forced local-Postgres-start failure shows a readable error and a
  working repair/restore path, never a blank window.
- Updating the app applies its migration exactly once, forward-only, and
  a repeated update attempt is a no-op.
- The desktop node passes every existing spec unmodified — proven by
  running `apps/api`'s own test suite against the bundled Postgres
  instance instead of a server one.

## Out of scope

Mobile (phone/tablet) offline-first deployment beyond `apps/pos`'s
existing PWA — a genuinely different platform with its own constraints,
named as a separate future document if a real need for it arises. A
peer-to-peer sync between two desktop nodes with no server at all —
`RETAIL-ERP.md`'s model is hub-and-spoke (a node syncs to its parent);
this document does not reopen that topology.
