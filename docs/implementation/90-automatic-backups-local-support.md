# 90 — Automatic backups: real infrastructure; "local support": a business commitment, not code

"Assurances of reliable data security through automatic cloud backups and
the promise of 'Local support you can trust'" splits into one already-
built engineering fact and one claim this document cannot honestly
address in code.

## 1. Automatic cloud backups — `deploy/backup.sh`, already real, already restore-tested

Doc 38 (`38-resilience-engineering.md`) already states plainly: "`deploy/
backup.sh` already restore-tests every dump before calling a backup
good — real, working infrastructure, not a stated intention." Doc 38's
own work order (WO-38.4) is to *measure and document* the real RPO
(backup interval, from `deploy/systemd/yaseen-backup.timer`'s actual
schedule) and RTO (restore wall-clock time, from `backup.sh`'s own
restore-test path) rather than leaving them implicit — that measurement,
not a new backup mechanism, is the one remaining engineering gap doc 38
already names and this document does not duplicate.

## 2. "Local support you can trust" is a support-organization commitment, named honestly as out of scope

Nothing in an ERP's application code can make a support promise true —
that is staffing, response-time commitments, and a support-ticketing
process (doc 64, this same batch set, already builds the in-app help-desk
mechanism a support team would use to *deliver* on such a promise). This
document names the distinction explicitly rather than either silently
ignoring the phrase or inventing a fictional "trust score" feature to
appear to address it: doc 64's help-desk ticketing is the one concrete,
buildable piece of infrastructure "local support" implies, and it is
already scoped there.

## Scope lenses

Not repeated — no new schema, write path, or permission; doc 38's own
scope lenses already answer every lens for the backup/DR mechanism, and
doc 64's own lenses cover the support-ticketing infrastructure.

## Work orders

None new. Doc 38's own WO-38.4 (measure and document real RPO/RTO,
schedule the quarterly game-day) remains the actual open engineering item
for backups; it is not re-opened or duplicated here.

## Acceptance

- No schema or code change — verified by citation to doc 38's existing
  `deploy/backup.sh`/`yaseen-backup.timer` infrastructure and doc 64's
  help-desk mechanism.

## Out of scope

Any code-level attempt to represent "trustworthiness of local support" —
this is an organizational and contractual commitment, not a software
capability; the one real, buildable piece of infrastructure behind it
(a support-ticketing system) is doc 64's own scope, not duplicated here.
