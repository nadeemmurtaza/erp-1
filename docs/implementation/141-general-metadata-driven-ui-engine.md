# 141 — A general metadata-driven UI engine, built by explicit owner override (ADR-026), scoped to stay inside the design system's own enforcement

Doc 105 declined a general server-metadata-driven rendering engine for
every screen, because it would need its own parallel implementation of
design-system compliance (Law 4's seven widths, the 48×48 touch target,
`pnpm check:overflow`) that the hand-authored components already get for
free. Per ADR-026, the owner instructed this be built anyway, so a future
compliance-driven field (or any new field, on any screen this engine
covers) updates globally from a metadata change, with no frontend
deploy. This document builds it, with the one guardrail doc 105 already
named made explicit and mandatory rather than assumed away.

## 1. A metadata payload describes a form; the renderer is built from the same primitives every hand-authored screen already uses

```ts
interface FieldMetadata {
  key: string;
  label: string;
  valueType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT';
  isRequired: boolean;
  options?: string[]; // for SELECT
  helpText?: string;
}

interface FormMetadata {
  entityType: string;
  fields: FieldMetadata[];
}

// The renderer maps each FieldMetadata onto the IDENTICAL design-system
// primitives (Input, Select, Checkbox, DatePicker) a hand-authored form
// already imports from @newax/shared — never a second, parallel component
// library reimplementing what a text input looks like. This is the one
// non-negotiable guardrail: the renderer's own generated markup is
// composed ENTIRELY from primitives pnpm check:overflow/check:contrast
// already sweep, so a metadata-driven form is checked by the exact same
// tooling as a hand-authored one, never a blind spot the sweep cannot see.
function renderMetadataForm(metadata: FormMetadata, values: Record<string, unknown>): JSX.Element {
  // composes @newax/shared primitives only — no raw <input>, no inline
  // style, no bespoke layout the design-system checks don't already cover.
}
```

## 2. The mandatory guardrail, stated once so it cannot be silently dropped under time pressure

Doc 105's own real risk was never "metadata-driven rendering is
impossible to do safely" — it was "a generic renderer easily becomes a
second, uninspected component library." The mitigation is structural, not
aspirational: `renderMetadataForm()` **may only ever call
`@newax/shared`'s own existing primitive components** — never raw HTML
elements, never a bespoke layout container outside the design system's
own grid/spacing tokens. This is enforced the same way this repository
enforces every other structural rule: an ESLint rule (or, if that proves
insufficiently precise, a `scripts/check-metadata-renderer.mjs` static
check alongside `check-module-boundaries.mjs`) that fails the build if
`renderMetadataForm()`'s own source imports anything outside the approved
primitive set. **This check ships in the same PR as the renderer itself,
never as a follow-up** — a renderer without it is exactly the
unenforced parallel path doc 105 warned against.

## 3. Where this engine is used, and where it deliberately is not

This engine is the generalized form of doc 104/140's own custom-field
renderer (now serving arbitrary metadata payloads, not only
`CustomFieldDefinition`/`EntityAttribute` rows) and is available to any
future screen an admin wants to make metadata-configurable. It does not
retroactively replace any existing hand-authored screen — `PayRunLine`'s
own detail view, the POS till, and every screen with real, non-generic
business logic in its event handlers stay hand-authored, because a
metadata payload has no way to express "compute `netMinor` from these
three other fields" or "block submission if the till has no open shift."
Metadata-driven rendering is for **data collection and display**, never
for a screen whose behavior includes real business logic beyond field-
level validation.

## Scope lenses

**The actor with three tables / The principal with no permission key /
The grant that ends itself** — n/a: `FormMetadata` is configuration, not
an actor.
**Whose rows, and which columns** — a `FormMetadata` definition is
`organizationId`-scoped exactly as `CustomFieldDefinition`; who may edit
it is gated by `settings.metadata-forms.manage`.
**The threshold nobody approves alone / The toxic pair / Authority and
blast radius** — n/a: editing a form's metadata commits no money or
stock; the audit row is `AuditService`'s own existing log.
**Audience is a capability, not an address / Request or record / The
movement with no address / The unwritten posting rule / Every column or
none / The period that already moved / The second legal entity / Dry run
before live** — n/a: no money/stock fact, no notification, no computed
rule beyond field-level validation the metadata itself states.
**Three silhouettes** — Solo: rarely used. Chain/Organization: a real
value once a compliance field genuinely needs to appear on many
deployments at once with no coordinated frontend release.
**The absent collaborator** — with the metadata-forms module off, no
metadata-driven screens render; every hand-authored screen is entirely
unaffected, since this engine is additive.
**The second copy of the write** — n/a beyond whatever the target
entity's own write path already guarantees; this engine is a rendering
layer, not a new write mechanism.
**The hundred-thousandth row** — `FormMetadata`/`FieldMetadata` are small,
admin-authored configuration, never a high-volume table.
**The reversal document / The undo fan-out / The version stamp** — a
`FormMetadata` change applies to the next render; a record already
submitted under an older field set is unaffected, per this repository's
own "a policy change applies going forward" discipline (doc 96).
**The erasure the ledger cannot obey** — n/a beyond the target entity's
own existing answer; this engine stores no data of its own beyond the
form's own shape.
**The failure path** — the static enforcement check (§2) fails the build,
not a runtime error, if a future `renderMetadataForm()` change tries to
import outside the approved primitive set — the earliest possible point
to catch the exact risk doc 105 named.

## Work orders

**WO-141.1 — `FormMetadata`/`FieldMetadata` schema and admin editor.**
**WO-141.2 — `renderMetadataForm()`**, composed exclusively from
`@newax/shared` primitives.
**WO-141.3 — the static enforcement check**, shipped in the same PR as
WO-141.2, never as a follow-up.
**WO-141.4 — extend `pnpm check:overflow`'s own sweep to render at least
one representative metadata-driven form**, so the seven-width/design-law
coverage this repository already requires of every screen also reaches
this one, per doc 66's own established convention for extending an
existing check's coverage rather than assuming it.

## Acceptance

- `renderMetadataForm()`'s own generated markup passes
  `pnpm check:overflow`/`check:contrast` identically to a hand-authored
  screen.
- The static enforcement check fails CI if a future change to the
  renderer imports outside the approved primitive set — proven by a
  test that deliberately introduces a raw `<input>` and confirms the
  check catches it.
- No metadata-driven form is ever used for a screen whose behavior
  requires real business logic beyond field-level validation — enforced
  by code review, since this boundary cannot be checked mechanically.

## Out of scope

Retrofitting existing hand-authored screens to render from metadata —
not attempted; this engine is additive, for new metadata-configurable
data-collection screens only, never a replacement for a screen with real
business logic in it.
