# 52 — A dedicated staff mobile experience, built on what already exists

`apps/mobile` is, by its own index entry, "Expo — **customer** app." A
third native app stack for staff, next to `apps/mobile` (customer) and
`apps/pos` (till), would duplicate a mobile tech stack this repository
already has two of — exactly the "can the existing system already solve
this" question `CLAUDE.md` asks before adding an abstraction. `apps/pos`
already answers it: **a Next.js PWA, installable, offline-capable, is
this codebase's own proven pattern for "staff needs this on a phone."**
This document is the identical pattern applied to self-service instead of
till operation, not a new one.

**A self-service payroll page already exists**
(`apps/web/.../payroll/me/page.tsx`, doc 19). The seven laws already
require every admin screen to render correctly at every one of the seven
widths, phone included — so a staff member visiting that page on their
phone today already gets a working, if unstyled-as-an-app, experience.
What is genuinely missing is threefold: **the app cannot be installed**
(`apps/web` ships no PWA manifest or service worker), **there is no
clock-in screen**, and **there is no schedule or announcements view.**

## 1. Self-service becomes installable, the same way the till already is

`apps/pos/public/sw.js` and its manifest are the existing, proven
reference. `apps/web`'s own `(admin)` self-service routes
(`/admin/payroll/me`, this document's new `/admin/me/attendance`,
`/admin/me/announcements`, `/admin/me/schedule`) gain the identical
installability treatment, scoped to just those routes — the storefront
and the rest of the admin console are unaffected; this is not "make the
whole web app a PWA," it is "make the self-service section of it one," the
same narrow-scope discipline every other extension in this document set
applies.

## 2. Clock-in is a self-service `AttendanceEvent`, not a new attendance model

```
Staff opens the installed app -> taps "Clock in" -> AttendanceEvent
  { source: SELF, kind: IN, occurredAt: now, orgUnitId: <resolved> }
```

This writes through doc 22's own unconditional, never-refused path — a
self-service clock-in is exactly `AttendanceSource.SELF`, a value doc 22's
enum already names. It gains nothing new except the screen; the
exception-classification, the offline-buffering, the `externalRef`
idempotency are all doc 22's own, unmodified. Where doc 30's geofencing
extension is enabled for field staff, the same screen submits coordinates
through that document's own existing path — this screen is a UI, not a
third attendance mechanism next to doc 22 and doc 30.

## 3. "My schedule" and "my announcements" are reads over existing rows

- **My schedule**: doc 22's `Shift` rows for the signed-in employee, plus
  doc 42's own `Timesheet` status for the current period — a read, no new
  schema.
- **My announcements**: doc 24's own notification/meeting audience
  resolution, filtered to what the signed-in employee's post has already
  received — a read over doc 24's existing delivery log, never a second
  notification system.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: every screen operates as the already-
authenticated `User`/`Employee`, no new actor.
**Whose rows, and which columns** — every screen in this document shows
only the signed-in employee's own rows — their own attendance, their own
schedule, their own received announcements — never another employee's,
enforced by `hr.*.view_own`-shaped permissions doc 19/22/24 already
establish, not a new permission model.
**The threshold nobody approves alone / The toxic pair** — n/a: self-
service reads and a self-attested clock-in commit no money and require
no approval beyond doc 22's own existing exception-reconciliation path.
**Authority and blast radius** — n/a beyond what doc 22/24/42 already
state for their own underlying writes and reads.
**Audience is a capability, not an address** — "my announcements"
restated as this document's own instance of the rule: it resolves what
this employee's post has already been sent, never a broadcast list this
screen invents.
**Request or record** — clock-in is doc 22's own RECORD, unchanged;
viewing a schedule or announcements is a read with no write at all.
**The movement with no address** — a self-service clock-in still names
`orgUnitId` exactly as every other doc 22 punch does — the screen resolves
it from the employee's own current posting (doc 20), never a default.
**Four hours down** — the installed PWA buffers a clock-in offline
exactly as `apps/pos` already buffers a sale, syncing on reconnect through
doc 22's own idempotent `externalRef` path — no new offline mechanism,
the identical one this codebase already ships and tests.
**Click the number** — a schedule entry links through to the shift/
timesheet row it came from; an announcement links to its own full record
in doc 24's meeting/notification screen.
**The unwritten posting rule / Every column or none / The period that
already moved / The second legal entity** — n/a: no money fact, no new
scoping beyond what the underlying doc 19/22/24/42 already state.
**Dry run before live** — n/a: every read here is already a pure read;
clock-in has no computed rule of its own to preview beyond doc 22's own
`workingDayOf()`, unchanged.
**Three silhouettes** — Solo: a small enough team that clock-in and
announcements are a nice-to-have. Chain: a real daily tool for staff
without a fixed office desk. Organization: many employees across offices,
the announcement-audience resolution (doc 24's own concern) starting to
matter at scale — unchanged by this document, which only adds the mobile
read.
**The absent collaborator** — with doc 22 off, no clock-in screen renders
(`MOD-1`'s layout-closes-over-absence rule, restated); with doc 24 off, no
announcements screen renders; "my schedule" degrades to timesheet-only if
doc 22's `Shift` data is absent.
**The second copy of the write** — doc 22's own `externalRef` idempotency,
unchanged, is what makes a retried offline clock-in safe — this document
introduces no second write path to deduplicate.
**The hundred-thousandth row** — n/a beyond what doc 22/24/42 already
state for their own tables; this document adds no table.
**The reversal document / The undo fan-out / The version stamp** — n/a:
every write this screen makes is doc 22's own, governed by that
document's own answers, unchanged.
**The erasure the ledger cannot obey** — n/a beyond what doc 22/24/42
already state.
**The failure path** — a clock-in that fails to sync while offline
surfaces on the app's own "pending sync" indicator (the identical pattern
`apps/pos`'s own offline outbox already shows for an unsynced sale),
never silently lost.

## Work orders

**WO-52.1 — PWA installability** for the self-service route group only:
manifest, service worker, offline shell, following `apps/pos/public/sw.js`'s
own proven approach.
**WO-52.2 — clock-in screen**: writes `AttendanceEvent` with
`source: SELF` through doc 22's existing service, offline-buffered.
**WO-52.3 — my-schedule screen**: reads doc 22's `Shift` + doc 42's
`Timesheet` status for the signed-in employee.
**WO-52.4 — my-announcements screen**: reads doc 24's own delivery log
for the signed-in employee's post.
**WO-52.5 — nav/app-shell**: an installable app icon/splash distinct from
the full admin console's own branding treatment (still `brand.ts`-derived,
never a literal), so staff opening "the work app" on their phone see a
focused three-screen tool, not the entire admin console's own navigation.

## Acceptance

- The self-service route group installs as a standalone app (manifest +
  service worker present, Lighthouse PWA check passing) without changing
  installability of the rest of `apps/web`.
- A clock-in submitted offline appears once connectivity returns, with no
  duplicate, proven by doc 22's own existing idempotency spec running
  against this new entry point.
- Every screen shows only the signed-in employee's own rows — proven the
  same way every other `_own`/`_all` permission boundary in this
  repository is tested (`16-pbac-row-scoping.md`'s own reference pattern).
- With doc 22 or doc 24 off, the corresponding screen simply does not
  appear in the app shell.

## Out of scope

A native Expo build of this experience — the PWA already meets "install
on a phone home screen" without a third mobile tech stack; a native app
is named as a future option only if a real requirement (app-store
distribution, a native-only device API) makes the PWA insufficient, not
assumed now. Push notifications for a new announcement — doc 33's
channels are where that would be sent; this document is the pull screen
that reads what was already delivered.
