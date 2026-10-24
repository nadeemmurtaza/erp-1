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

> **Status (2026-09-30): WO-48.1, WO-48.3, WO-48.4 and WO-48.5 built as
> real, tested code in a new `packages/desktop-runtime` package;
> WO-48.2/WO-48.6 (the shell and auto-update) deliberately not built, per
> this document's own text below that the framework choice "is a
> `DECISIONS.md` entry of its own once resourced … not settled here" —
> recorded as ADR-082, not adopted as a side effect of this pass.**
> `packages/desktop-runtime` is a new, Node-only workspace package
> (`apps/api`, `apps/pos` and every other module ship unmodified, exactly
> as this document's own §1 diagram requires) rather than living inside
> `packages/pos-core`, specifically so a browser bundler building
> `apps/pos` never has a reason to touch `serialport` or `embedded-
> postgres` — neither package ships anywhere near a browser.
>
> **WO-48.1 — `PostgresLifecycleManager`.** A real state machine over the
> `embedded-postgres` npm package (a maintained package that downloads a
> genuine, platform-specific Postgres server binary), not a mock: init/
> start/health-check/stop, a readable `PostgresLifecycleError` with a
> `repairAction` (`RETRY` / `RESTORE_FROM_BACKUP` / `REINSTALL`) per
> doc's own failure-path lens, and a random local superuser credential
> pair generated once per install (`PostgresCredentialStore`, 0o600,
> never a shared default — this document's own "Authority and blast
> radius" mitigation, built exactly as named). Proven for real, by hand,
> as a created non-root `postgres` OS user in this sandbox — this
> container otherwise runs as root, and Postgres correctly refuses to run
> its server process as root — via
> `pnpm run test:integration` (this package's own script; plain `pnpm
> test` skips this file with a printed reason when running as root):
> initialise/start/health-check/stop all completed against the real
> binary. That run also caught and fixed two real bugs no fake could have
> caught: `initdb` never creates the application database (`start()` now
> checks Postgres's own `pg_database` catalogue against its always-
> present `postgres` maintenance database and creates it if missing), and
> a copied data directory's baked-in role password must travel with it
> (`PostgresLifecycleManager.credentialsPath` is now exposed so
> `LocalBackupScheduler`'s own restore-test copies it, not a fresh
> generated one). A second, genuinely separate sandbox limitation:
> `embedded-postgres` ships ESM-only, which a real Node host (22.12+)
> loads via its own native `require(esm)` support (also proven by hand,
> outside Jest, against the real binary) but Jest's module loader cannot
> without `--experimental-vm-modules` — `EmbeddedPostgresRunner`'s own
> header comment names the exact workaround and why it is not
> obfuscation.
>
> **WO-48.3 — `FirstRunSetupWizard`.** Real, no-terminal orchestration:
> starts Postgres, shells out to `apps/api`'s own `db:deploy`/`db:seed`
> scripts (never a reimplementation), validates `NODE_ROLE`/`PARENT_URL`/
> `PARENT_API_KEY` against rules copied verbatim from `env.validation.ts`
> (documented as deliberately duplicated, with a pointer, since `apps/api`
> is a deployed app, not a library), and generates fresh random
> `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`APP_ENCRYPTION_KEY` values the
> same "never a shared default" way WO-48.1's own credentials are. A real
> gap this build surfaced and does **not** silently solve: `env.
> validation.ts` requires `REDIS_URL` in production with no usable
> default, and this document — before this pass — never named a managed
> local Redis the way it names a managed local Postgres. Rather than
> quietly defaulting to `localhost:6379` (nothing listens there on a
> fresh install) or quietly forcing `NODE_ENV=development` to dodge the
> production checks, `NodeConfig.redisUrl` is a required, explicit input
> the wizard refuses to proceed without — named in code and here as a
> real, separately-scoped follow-up (an embedded local Redis mirroring
> WO-48.1's own shape, or a documented decision to run the modules that
> need Redis disabled on a desktop node), never solved by this pass.
> Tested with a fake `MigrationRunner` and a fake Postgres — real,
> deterministic coverage of the orchestration itself (step order, failure
> labelling, idempotent re-run, config validation); wiring
> `DefaultMigrationRunner` against a live `prisma migrate deploy` in this
> sandbox was not attempted in this pass (a real further verification,
> not a gap in what shipped).
>
> **WO-48.5 — `LocalBackupScheduler`.** A real, discovered constraint
> shapes this one: `embedded-postgres`'s own binary distribution ships
> only `postgres`/`pg_ctl`/`initdb` — no `pg_dump`, no `psql` — verified
> by listing its installed binaries in this sandbox. `deploy/backup.sh`'s
> own live `pg_dump` approach is therefore not available to a desktop
> node; this scheduler does a **physical** backup instead (stop the local
> database, `tar`+gzip the whole data directory via the real `tar` npm
> package, restart immediately), which is a real, stated trade-off this
> document had not named: a brief interruption during backup that
> `deploy/backup.sh`'s live dump never needs. Doc 38's own restore-tested
> discipline is still applied in full: every archive is extracted into a
> throwaway scratch instance, started for real, and queried for real
> before being trusted, exactly `deploy/backup.sh`'s "a backup that has
> never been restored is a hope, not a backup." A catch-up check on
> `start()` covers "a desktop node is not always running" (this
> document's own brief) — an overdue backup runs immediately rather than
> waiting for a `@nestjs/schedule` `@Cron` tick that may never arrive
> while the till is off; this scheduler is therefore a plain timer-driven
> class the future shell's own process invokes, not a NestJS provider —
> matching `apps/api`'s own "unmodified" requirement in this document's
> §1 diagram, since a Postgres-lifecycle-owning backup scheduler cannot
> live inside the Nest app whose database it stops and restarts. Proven
> for real, non-root, end to end via `test:integration`: a real table
> created and populated, backed up, the live instance restarted, and the
> archive independently restored and re-queried with the real row still
> present. `TarBackupArchiver`'s own archive/extract round trip is proven
> unconditionally (no Postgres involved, so no root constraint applies).
>
> **WO-48.4 — native hardware drivers.** `SerialPortReceiptPrinter` and
> `SerialPortCashDrawer` implement doc 31's own `ReceiptPrinter`/
> `CashDrawer` interfaces (`packages/pos-core/src/hardware.ts`, imported
> by type only) against the real `serialport` npm package and a
> documented ESC/POS byte-command set (`hardware/escpos.ts`, pure
> functions, exhaustively unit-tested with no mock at all). **Explicitly
> untested against real hardware** — no serial printer, cash drawer, or
> even a listable serial port exists in this sandbox (`SerialPort.list()`
> itself fails here for want of the `udevadm` binary, confirmed by hand);
> every other behaviour (open/write/drain/close sequencing, failure
> handling, the drawer-kick pulse bytes) is proven against an injected
> fake serial port, which is a different, honest limitation from "not
> built" — the real protocol logic is real and tested, only its contact
> with an actual device is not.
>
> **Not built, by this document's own design, not by omission:**
> WO-48.2 (the Electron/Tauri shell) and WO-48.6 (auto-update) — no
> shell scaffold, no installer, no updater. This is the deferral this
> document's own §2/work-orders text already calls for, recorded now as
> **ADR-082**. **ADR-080** (doc 211, the cloud/offline commercial split)
> already names this document as a precondition of a plan on the public
> pricing page — whoever picks up WO-48.2/WO-48.6 next should know a real
> business dependency is waiting on it, not only an architectural one.
>
> Every claim above is a command that was actually run, not a plan —
> `pnpm --filter @newax/desktop-runtime test` (unit, root-safe, the
> default `pnpm test`) and `pnpm --filter @newax/desktop-runtime run
> test:integration` (the real binaries, run by hand as non-root during
> this build) both pass; each `*.integration.spec.ts` file's own header
> comment names exactly which constraint it works around and how.

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
