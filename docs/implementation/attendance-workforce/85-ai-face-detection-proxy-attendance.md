# 85 — Fake/proxy attendance: doc 30 and doc 55 already answer this

"AI Face Detection specifically deployed to solve pain points like 'Fake /
Proxy Attendance,' manual HR workload errors, and the lack of real-time
monitoring" is, verbatim, doc 30's own `FaceMatchProvider`/
`FaceMatchVerification` mechanism, already coverage-noted once this batch
set at doc 55 ("Anti-proxy verification... already fully specified in doc
30's `FaceMatchProvider`/`FaceMatchVerification` — cited, not rebuilt") and
again at doc 65 (existing camera repurposing). This is the third citation
of the same real mechanism from three different promotional phrasings —
confirming, not re-specifying, that the capability exists.

## What already answers each named pain point

- **"Fake / Proxy Attendance"** — doc 30's `FaceMatchVerification` row,
  linked 1:1 to an `AttendanceEvent`, is the direct technical answer: a
  punch without a matching face-verification confidence score is visibly
  distinguishable from one with a high-confidence match, exactly what a
  proxy-punch detection needs. Doc 55's own coverage note already cites
  this in full.
- **"Manual HR workload errors"** — doc 43's `classifyDay()` (present/
  absent/on-leave classification) plus doc 59's ratio aggregation already
  remove the manual tallying this phrase describes; doc 22's own
  attendance-event model removes manual timesheet transcription.
- **"Lack of real-time monitoring"** — doc 59's attendance-ratio tile
  (today's present/absent/on-leave breakdown) and doc 76's POS dashboard
  (a floor-level glance screen) are both this same-batch-set's own answer
  to "real-time," honestly scoped per doc 58's own polling-not-push
  disclosure.

## Scope lenses

Not repeated — doc 30's own scope lenses already answer every lens for
this exact mechanism.

## Work orders

None against this bullet specifically. Doc 30's own work orders (WO-30.1,
WO-30.2) remain the actual build; docs 55/65/85 are three citations of the
same already-specified capability from three different marketing angles.

## Acceptance

- No schema, service, or permission change — verified by citation to doc
  30/43/55/59/65/76's own existing mechanisms.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
the promotional list's own bullet has a corresponding, citable document.
