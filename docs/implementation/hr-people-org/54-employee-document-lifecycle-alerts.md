# 54 — Employee document lifecycle alerts: one watcher, not two

Doc 27 (WO-27.3) and doc 28 (WO-28.5) each name the identical thing and
each explicitly defer to the other: doc 27's own words are "expiry-warning
nightly job (shared pattern with doc 27's certificate expiry)" — sorry,
precisely: doc 28 says "shared pattern with doc 27's certificate expiry
(nightly)," and doc 27 says its own job is a "nightly job pattern"
`EmployeeDocument` (doc 28) will reuse. Naming a shared pattern twice and
building it nowhere is exactly the trap this document exists to close: **one
generic expiring-record watcher, both documents' expiry fields register
into it**, never two independently-scheduled nightly jobs quietly drifting
apart.

## 1. An expiring record is a registered source, not a hardcoded pair

```ts
export interface ExpiringRecordSource {
  readonly recordKind: string; // "employee-document", "certificate"
  /** Rows whose expiry falls inside the lookahead window and have not
   *  already been alerted for this specific expiry date — the source
   *  itself tracks that, so a redelivered run of the watcher never
   *  re-sends the same warning twice. */
  findExpiring(lookaheadDays: number): Promise<ExpiringRecord[]>;
}

interface ExpiringRecord {
  id: string;
  employeeId: string;
  label: string;       // "Work permit", "Food Handler Certificate"
  expiresOn: Date;
  category: 'DOCUMENT' | 'CERTIFICATE';
}
```

`EmployeeDocument` (doc 28) and `EmployeeSkill` (doc 27) each register
their own `ExpiringRecordSource` implementation — the identical
registration-not-import pattern doc 44's action hub already establishes,
reused here for the identical reason: two modules that should not import
each other still need one shared mechanism, and a registry is how that
happens without a coupling.

## 2. One nightly run, one notification shape, both sources

```
Nightly job -> for each registered ExpiringRecordSource:
                 findExpiring(lookaheadDays) -> one notification per record,
                 through doc 33's channels, to the employee AND their
                 manager (reportsTo, doc 20) -> also surfaces on doc 44's
                 manager action hub as an EXPIRING_DOCUMENT/
                 EXPIRING_CERTIFICATE item
```

The lookahead window (how many days before expiry the first warning
fires) is a policy setting per `organizationId`, not a hardcoded number —
a work-permit renewal and a food-handler certificate plausibly need
different lead times, expressed as a per-`recordKind` policy row rather
than one constant serving both.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: the watcher reads existing actors
(`Employee`) through each source's own already-scoped query.
**Whose rows, and which columns** — an alert is visible to the employee
it concerns and their manager, exactly the visibility doc 27/28 already
state for the underlying record; the watcher itself introduces no wider
audience.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: a notification commits no money or stock; who may
configure the lookahead policy is `hr.admin`, unchanged from doc 27/28's
own admin scope.
**Audience is a capability, not an address** — restated as this
document's own design: the employee and their `reportsTo` post, resolved
per doc 20's chain, never a stored address — the identical rule doc 24's
escalation and doc 44's hub already apply.
**Request or record** — the watcher's own read is neither; the
notification it sends is a RECORD attempt (doc 33's own delivery
tracking), never refused, only logged as sent or failed.
**The movement with no address / The unwritten posting rule / Every
column or none / The period that already moved / The second legal
entity** — n/a: no money or stock fact.
**Dry run before live** — `findExpiring(lookaheadDays)` on each source is
already a pure read with a preview caller (an admin "what would tonight's
run alert on" screen) and the live nightly job as its second caller — one
implementation, restated as this document's own instance of the pattern
doc 27/28 each already promised.
**Three silhouettes** — Solo: perhaps zero expiring records ever;
the watcher runs and finds nothing, cheaply. Chain: a real operational
signal — work permits, food-handler certificates across branches.
Organization: volume across many employees and record kinds, the "one
watcher, not two schedules silently drifting" argument at its strongest.
**The absent collaborator** — with doc 27 or doc 28 off, that source is
simply not registered — the watcher runs the sources that are present and
finds nothing for the absent one, never errors for a missing registration.
**The second copy of the write** — each source's own `findExpiring()`
excludes a record already alerted for its current `expiresOn` (§1's own
"has not already been alerted" clause) — a redelivered or re-run nightly
job sends no duplicate warning for the same expiry date; a corrected/
renewed `expiresOn` (a new date) is, correctly, alertable again.
**The hundred-thousandth row** — bounded by each source's own already-
indexed `expiresOn` column (`EmployeeDocument`, `EmployeeSkill` both
already index it per doc 27/28); the watcher's own alert-sent tracking is
one small row per (record, expiry-date) pair, never unbounded.
**The reversal document / The undo fan-out / The version stamp** — n/a:
an alert is not itself reversed; a renewed document/certificate simply
stops appearing in `findExpiring()` once its new `expiresOn` is set,
automatic, no explicit "cancel this alert" action needed.
**The erasure the ledger cannot obey** — n/a beyond doc 27/28's own
stated `Employee`-keyed retention; the watcher persists only which
(record, expiry-date) pairs were already alerted, itself deleted when the
underlying record is (cascade, matching doc 27/28's own cascade rules).
**The failure path** — a failed notification send (doc 33's own delivery
failure) is retried by that document's own retry mechanism; the watcher
itself marks a source's run failed and retries that source next night
rather than blocking every other registered source.

## Work orders

**WO-54.1 — `ExpiringRecordSource` registry** + the nightly watcher —
this is the ONE job doc 27's WO-27.3 and doc 28's WO-28.5 each already
named; building it here means neither document builds a second one.
**WO-54.2 — source registrations**: `EmployeeDocument` (doc 28) and
`EmployeeSkill`/certificate (doc 27) each implement `ExpiringRecordSource`.
**WO-54.3 — per-`recordKind` lookahead policy**, admin-configurable.
**WO-54.4 — doc 44 integration**: expiring records surface on the manager
action hub as `EXPIRING_DOCUMENT`/`EXPIRING_CERTIFICATE` items, reusing
that document's own registered-source pattern rather than a third
mechanism.

## Acceptance

- A single nightly run alerts on both expiring documents and expiring
  certificates, from one schedule, one job.
- Re-running the watcher for the same night sends no duplicate alert for
  a record whose `expiresOn` has not changed.
- Renewing a document (a new `expiresOn`) makes it alertable again on its
  own new schedule.
- With doc 27 or doc 28 off, the watcher runs with that source simply
  absent, never erroring.
- Every alert appears on doc 44's action hub for the relevant manager.

## Out of scope

Automatic renewal reminders sent to the *employee's own external
issuer* (a government agency, a certification body) — this document
alerts the business, not a third party; that is a materially different
integration this document does not build.
