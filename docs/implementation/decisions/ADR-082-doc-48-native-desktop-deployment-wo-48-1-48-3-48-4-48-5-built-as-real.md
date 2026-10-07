# ADR-082 — Doc 48 (native desktop deployment): WO-48.1/48.3/48.4/48.5 built as real code in a new `packages/desktop-runtime`; the Electron/Tauri shell and auto-update stay unbuilt, exactly as the document's own text already scoped

[← Decision log](../DECISIONS.md)


### Context

Doc 48 proposes a desktop install as a real `RETAIL-ERP.md` node —
`apps/api` unmodified, an embedded managed Postgres, `apps/pos`/the admin
console, and the existing replication client, wrapped by a shell doc 48
itself never picks: "the choice between the two frameworks is a
`DECISIONS.md` entry of its own once resourced … not settled here"
(WO-48.2). Separately, ADR-080 (doc 211) has just named doc 48 a
precondition of a licensing plan already on the public pricing page,
raising the real-world stakes of the parts that are buildable now without
that shell decision.

### Options Considered

1. **Wait for the shell decision before building anything.** Rejected —
   doc 48's own text is explicit that the Postgres lifecycle, the setup
   wizard, and the hardware drivers are "real, testable orchestration
   logic … independent of which shell eventually wraps it." Waiting would
   leave real, buildable, independently valuable code unbuilt for a
   reason that does not apply to it.
2. **Pick Electron or Tauri now, as a side effect of building the rest.**
   Rejected — this is exactly the decision doc 48's own text reserves for
   a dedicated `DECISIONS.md` entry "once resourced," weighing bundle
   size, native-module support, and cross-platform build tooling; none of
   that evaluation was done in this pass, so adopting either framework
   here would be exactly the "settled" this document explicitly declines
   to be.
3. **Build WO-48.1/48.3/48.4/48.5 as real code behind a shell-agnostic
   interface, in a new package neither `apps/api` nor `apps/pos` need to
   import, and record the shell/auto-update deferral as its own decision
   rather than silently skipping it.** Chosen.

### Decision

A new workspace package, `packages/desktop-runtime` (Node-only, no
consumer today): `PostgresLifecycleManager` (real `embedded-postgres`
binary, random per-install credentials, a classified
`PostgresLifecycleError` with a `repairAction`), `FirstRunSetupWizard`
(no-terminal orchestration over `apps/api`'s own `db:deploy`/`db:seed`
scripts, validating `NODE_ROLE`/`PARENT_URL`/`PARENT_API_KEY` against
rules mirrored from `env.validation.ts`), `LocalBackupScheduler` (a
physical stop/tar/restart backup with a real restore-test, since
`embedded-postgres`'s own binary distribution ships no `pg_dump`/`psql`),
and `SerialPortReceiptPrinter`/`SerialPortCashDrawer` (native ESC/POS
drivers implementing doc 31's own `ReceiptPrinter`/`CashDrawer`
interfaces). WO-48.2 (the shell) and WO-48.6 (auto-update) are not built
— no Electron/Tauri scaffold, no installer, no updater — matching doc
48's own text precisely, not a scope reduction invented here.

### Reasoning

`packages/desktop-runtime` rather than `packages/pos-core` (where the
`ReceiptPrinter`/`CashDrawer` interfaces already live): `pos-core` is
consumed by `apps/pos`, a browser PWA a bundler builds; `embedded-
postgres` and `serialport` are Node-only, one with native bindings, and
neither belongs anywhere near a browser bundle graph, even as dead code a
bundler would have to be trusted never to reach. A dependency this
narrow-purpose earns its own package rather than risking that. The
Postgres-lifecycle and setup-wizard code runs *before* `apps/api` can
even boot (it is what starts Postgres and writes the env `apps/api`
reads), so it structurally cannot live inside `apps/api` itself without
contradicting doc 48's own "`apps/api`, unmodified" diagram — the same
reasoning places `LocalBackupScheduler` outside `apps/api` too, since it
is the thing that stops and restarts the very process a Nest-hosted
scheduler would need to keep running.

Two real, previously-unnamed gaps surfaced by actually building this,
recorded rather than quietly patched over: `env.validation.ts` requires
`REDIS_URL` in production with no usable default, and doc 48 never named
an embedded local Redis the way it names an embedded local Postgres — the
wizard now requires `redisUrl` as an explicit input rather than
defaulting it into a broken or dishonestly-downgraded configuration.
Separately, `embedded-postgres`'s binary distribution ships no client
tools, so `LocalBackupScheduler` is a physical (data-directory) backup,
not `deploy/backup.sh`'s live logical (`pg_dump`) one, and therefore
briefly stops the local database during a backup — a real trade-off
`deploy/backup.sh` does not have and doc 48 did not previously state.
Both are named here and in doc 48's own status blockquote as real,
separately-scoped follow-ups, not solved in this pass, per `CLAUDE.md`'s
own instruction that a separably larger capability is named and
sequenced, never silently stubbed.

Every mechanism above that touches a real external binary was proven
against the real thing, not only a fake: `embedded-postgres`'s actual
downloaded Postgres server binary and the real `tar` npm package were
both exercised end-to-end by hand in this sandbox (as a created non-root
OS user, since Postgres correctly refuses to run as root, and this
sandbox otherwise runs as root) via this package's own `test:integration`
script — init/start/health-check/stop, the database-bootstrap fix, the
credentials-must-travel-with-the-data-directory fix, and a full backup
plus independent restore-and-verify cycle all passed for real. The
serial-hardware drivers are the one piece with no real device in this
sandbox to test against at all (confirmed: even `SerialPort.list()`
itself fails here for want of `udevadm`) — their protocol logic is real
and unit-tested against a documented ESC/POS command set, but contact
with an actual printer or drawer is honestly unverified, not built-and-
claimed-working.

### Consequences

`packages/desktop-runtime` has no consumer yet — it is real, tested,
buildable code waiting for WO-48.2's own shell to invoke it, the same
"ships inert, ready the day it's needed" posture doc 37's own
`FeatureFlag`/versioning infrastructure already takes. ADR-080's naming
of doc 48 as a precondition of a public pricing plan means WO-48.2/48.6
are no longer a purely architectural deferral — whoever picks up the
shell/packaging decision next should read this ADR and ADR-080 together
before resourcing it. The Redis and physical-backup gaps this ADR names
are real, open engineering items, not merely documented risk: a
production desktop deployment today would need one of the Redis
mitigations named above, and its backup schedule should account for the
brief stop this design requires.

### Status
**Accepted.**
