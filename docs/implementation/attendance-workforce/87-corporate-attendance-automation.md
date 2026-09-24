# 87 — "Corporate attendance automation, branded (e.g., CAMS)": the capability is real, the brand name never enters the code

"Corporate attendance automation systems specifically branded (e.g.,
CAMS) for enterprise-level workforce management" names, functionally,
exactly what docs 22/30/43/59 already build together: `AttendanceEvent`
(the physical punch record), `FaceMatchVerification` (biometric
verification), `classifyDay()` (present/absent/on-leave classification),
and the roster-wide ratio aggregate — a complete, real, enterprise-scale
corporate attendance automation system. **The one thing this bullet's own
wording requires flagging explicitly is the word "branded":** `CLAUDE.md`'s
Law 1 states, without exception, "No brand, locale or design literal in
application code... every one resolves through an import from
`packages/shared/src/brand.ts`. The only exception is Newax's own
attribution and the `@newax/*` package scope." A product name like "CAMS"
— whether it is this deployment's own product name, a competitor's, or a
placeholder — is exactly the kind of literal Law 1 forbids from ever
appearing hardcoded in application code, and `pnpm check:rebrand`
(`scripts/check-rebrand.mjs`) already exists specifically to catch this
class of leak.

## What this means concretely

- **The capability is fully built** — doc 22/30/43/59's own combined
  mechanism already is a complete corporate attendance automation system,
  suitable for enterprise-scale deployment (multi-branch, multi-thousand-
  employee rosters, per doc 59's own "Three silhouettes" answer).
- **Its displayed name is a `brand.ts` value, never a string in a
  component or service** — if a client wants their deployment's
  attendance module labeled "CAMS" (or any other name) in the UI, that
  label resolves through `packages/shared/src/brand.ts` exactly like
  every other client-facing string this repository ever renders, checked
  by `pnpm check:rebrand`'s own existing matcher on every commit.
- **No module, permission key, database table, or domain event in this
  repository is named after a product brand** — `AttendanceEvent`,
  `FaceMatchVerification`, `hr.attendance.view` and every other internal
  identifier already use plain, descriptive names, never a marketing
  label, so relabeling the *displayed* product name for a given client
  requires zero code changes anywhere these identifiers appear.

## Scope lenses

Not repeated — doc 22/30/43/59's own scope lenses already answer every
lens for the underlying attendance-automation mechanism; this document
adds no new schema, write path, or permission, only the naming
constraint above.

## Work orders

None against the attendance mechanism itself. **WO-87.1 (verification
only)** — if a client-facing "branded" label for this module is ever
requested, confirm it is added as a `brand.ts` value (or a
`BulletinCategory`/module-display-name style configuration, per whatever
this repository's own convention for a client-facing module label already
is) and that `pnpm check:rebrand` passes with the new label present —
never hardcoded inline.

## Acceptance

- No schema, service, or permission change — verified by citation to doc
  22/30/43/59's own existing mechanisms.
- `pnpm check:rebrand` continues to pass, confirming no brand literal
  (including any specific product name a client might request) is
  hardcoded in application code.

## Out of scope

Nothing further — this domain has no remaining engineering gap; this note
exists so the promotional list's own bullet has a corresponding, citable
document, and so its "branded" wording is answered correctly rather than
silently risking a Law 1 violation later.
